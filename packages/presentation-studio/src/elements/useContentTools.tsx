/**
 * Phase 7 CONTENT: pictures, shapes, tables, charts and diagrams on slides. One hook gives the editor everything it
 * needs for them: the insert commands (Insert tab, placeholders, paste and drop), editing their contents in place
 * (shape text and table cells, drawn above the canvas), the chart data dialog, the diagram editor through the app's
 * host, the inspector panel and the object menu items. Every change goes through the editor's model, so it is one
 * undo step in the one history and is saved like any other change.
 */
import { useToast } from '@dcos/ui';
import type { Editor } from '@tiptap/core';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { newId } from '../create';
import { insertElements, updateElements, updateSlide } from '../editor/model';
import type { EditorModel } from '../editor/useEditorModel';
import type { Point } from '../geometry';
import type { PresentationDiagramHost, PresentationDiagramStart, PresentationEmbeddedDiagram, PresentationImageHost } from '../hosts';
import { shapeTextBox } from '../render/shapePaths';
import { emptyRichText, type ChartElement, type ChartType, type ImageElement, type Placeholder, type PresentationContent, type ShapeElement, type ShapePreset, type Slide, type SlideElement, type TableElement, type TextElement } from '../types';
import type { ContextMenuItem } from '../ui/ContextMenu';
import { ChartDataDialog } from './ChartDataDialog';
import { centred, fitOnSlide, newChart, newDiagram, newImage, newShape, placeholderBox, withEditedDiagram } from './defaults';
import { altFromFileName, choosePictureFile, pictureFiles, storePicture } from './images';
import { PlaceholderButtons, emptyPlaceholders } from './PlaceholderButtons';
import { ShapeTextOverlay } from './ShapeTextOverlay';
import { TableOverlay } from './TableOverlay';
import { cellAt, cellBox, fitTableToBox, insertRow, newTable, rangeOf, setCellText, setRowHeights, tableHasSpans, type CellRef } from './table';

/** What is being edited in place: a shape's text, or a table's cells (the active cell and the range's other corner). */
export type ContentEdit = { kind: 'shape-text'; id: string; session: number; caretAt: { x: number; y: number } | null } | { kind: 'table'; id: string; session: number; cell: CellRef; anchor: CellRef };

export interface ContentToolsOptions {
  model: EditorModel;
  imageHost?: PresentationImageHost;
  diagramHost?: PresentationDiagramHost;
  /** The live text editor (the ribbon formats through it) while a shape's text or a cell is edited. */
  onEditor: (editor: Editor | null) => void;
  /** Puts the focus back on the canvas. */
  focusCanvas: () => void;
  /** Ends text box editing (before something else takes over). */
  stopTextEdit: () => void;
  /** The editor's root element (to measure the drawn tables). */
  root: RefObject<HTMLElement | null>;
}

const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** A shape's text as a text box (its text area), so the ribbon's text formatting and the text editor work on it. */
export function shapeTextElement(el: ShapeElement): TextElement | null {
  if (el.preset === 'line' || !el.textStyle) return null;
  const tb = shapeTextBox(el.preset, el.w, el.h);
  return { id: el.id, type: 'text', x: el.x + tb.x, y: el.y + tb.y, w: tb.w, h: tb.h, rotation: 0, text: el.text ?? emptyRichText(), style: el.textStyle };
}

/** A shape after a change made to its text as a text box (shapeTextElement). */
export function applyToShapeText(el: SlideElement, change: (t: TextElement) => TextElement): SlideElement {
  if (el.type !== 'shape') return el;
  const t = shapeTextElement(el);
  if (!t) return el;
  const next = change(t);
  if (next === t || (next.text === t.text && next.style === t.style)) return el;
  return { ...el, text: next.text, textStyle: next.style };
}

/** What the editor's other parts call (the Insert tab, the inspector, the canvas, the object menu, paste and drop). */
export interface ContentTools {
  canPictures: boolean;
  canDiagrams: boolean;
  diagramTemplates: Array<{ id: string; name: string }>;
  busy: boolean;
  insertPicture: () => void;
  insertShape: (preset: ShapePreset) => void;
  insertTable: (rows: number, columns: number) => void;
  insertChart: (type: ChartType) => void;
  /** A new diagram (from a template when given), one from the user's diagrams, or one from a diagrams.net file. */
  insertDiagram: (from: { templateId?: string; title?: string } | 'library' | 'file') => void;
  replacePicture: (id: string) => void;
  editDiagram: (id: string) => void;
  editChartData: (id: string) => void;
  /** Starts editing a shape's text or a table's cells. */
  editContents: (id: string, at?: Point, screen?: { x: number; y: number }) => void;
  /** Double-click / Enter / second tap on an object other than a text box. */
  open: (el: SlideElement, at?: Point, screen?: { x: number; y: number }) => void;
  /** Fills an empty picture, chart or table placeholder of the current slide's layout. */
  fillPlaceholder: (p: Placeholder) => void;
  /** Pictures from a paste event: true when it held any (they are being inserted). */
  pastePictures: (e: ClipboardEvent) => boolean;
  /** Picture files dropped on the slide at `at`. */
  dropFiles: (files: File[], at: Point) => void;
  /** Changes one object (one undo step, or part of `group`). */
  update: (id: string, change: (el: SlideElement) => SlideElement, group?: string) => void;
  edit: ContentEdit | null;
  stop: () => void;
  /** The shape whose text is being edited, as a text box (for the ribbon's text formatting). */
  textTarget: TextElement | null;
  /** The content edit layer for the canvas (shape text editor, table cells, empty placeholders). */
  layer: ReactNode;
  /** How the canvas draws the object whose contents are edited (its own text is hidden under the editor). */
  draw: ((el: SlideElement) => SlideElement) | undefined;
  /** Object menu items for the selection. */
  menuItems: (selected: SlideElement[]) => ContextMenuItem[];
  /** Dialogs (chart data). */
  dialogs: ReactNode;
  /** The editor's state the inspector shows. */
  content: PresentationContent;
  slide: Slide | null;
}

export function useContentTools(o: ContentToolsOptions): ContentTools {
  const { model, imageHost, diagramHost } = o;
  const toast = useToast();
  const { content, selection } = model.state;
  const slide = content.slides.find((s) => s.id === selection.slideId) ?? null;
  const [edit, setEdit] = useState<ContentEdit | null>(null);
  const [chartId, setChartId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  const session = useRef(0);
  useEffect(() => {
    alive.current = true;
    return () => void (alive.current = false);
  }, []);
  const opts = useRef(o);
  opts.current = o;

  const latest = () => model.latest();
  const currentSlide = () => {
    const s = latest();
    return s.content.slides.find((x) => x.id === s.selection.slideId) ?? null;
  };
  const findElement = (id: string): { slide: Slide; el: SlideElement } | null => {
    for (const s of latest().content.slides) {
      const el = s.elements.find((e) => e.id === id);
      if (el) return { slide: s, el };
    }
    return null;
  };

  // ── Editing in place ────────────────────────────────────────────────────────────────────────────

  const editRef = useRef(edit);
  editRef.current = edit;
  const stop = useCallback(() => {
    if (!editRef.current) return;
    editRef.current = null;
    // A session that ended where it started (typing undone inside the editor) leaves no empty undo step.
    model.endGroup({ dropIfUnchanged: true });
    setEdit(null);
  }, [model]);

  // Editing ends when its object is no longer the only selected one on the current slide (undo, another slide…).
  const editTarget = edit && slide ? slide.elements.find((e) => e.id === edit.id) : undefined;
  useEffect(() => {
    if (!edit) return;
    const ok = editTarget && selection.elementIds.length === 1 && selection.elementIds[0] === edit.id && (edit.kind === 'table' ? editTarget.type === 'table' && editTarget.rows.length > 0 : editTarget.type === 'shape');
    if (!ok) return stop();
    // A row or column deleted under the cell being edited (the inspector's Delete row/column): keep editing the nearest
    // cell that still exists rather than drawing an editor for a cell that is gone.
    if (edit.kind === 'table' && editTarget.type === 'table' && !tableCellExists(editTarget, edit.cell)) {
      const cell = clampCell(editTarget, edit.cell);
      model.endGroup();
      setEdit({ ...edit, cell, anchor: clampCell(editTarget, edit.anchor) });
    }
  }, [edit, editTarget, selection.elementIds, stop, model]);

  const editContents = (id: string, at?: Point, screen?: { x: number; y: number }) => {
    const s = currentSlide();
    const el = s?.elements.find((e) => e.id === id);
    if (!s || !el || el.locked) return;
    opts.current.stopTextEdit();
    session.current += 1;
    model.select({ elementIds: [id] });
    if (el.type === 'shape' && shapeTextElement(el)) setEdit({ kind: 'shape-text', id, session: session.current, caretAt: screen ?? null });
    else if (el.type === 'table') {
      let cell: CellRef = { row: 0, col: 0 };
      if (at) {
        const local = toLocal(el, at);
        const hit = cellAt(el, local.x, local.y);
        if (hit) cell = hit;
      }
      setEdit({ kind: 'table', id, session: session.current, cell, anchor: cell });
    }
  };

  // ── Inserting ───────────────────────────────────────────────────────────────────────────────────

  /** Adds objects on top of a slide (the current one, else the one given) and selects them: one undo step. */
  const add = (els: SlideElement[], slideId?: string) => {
    const s = (slideId && latest().content.slides.find((x) => x.id === slideId)) || currentSlide();
    if (!s) return false;
    opts.current.stopTextEdit();
    stop();
    const r = insertElements(latest().content, s.id, els, 0, (() => {
      let i = 0;
      return () => els[i++]?.id ?? newId();
    })());
    // Keep the placeholder links of the objects that fill placeholders (insertElements drops them for pasted copies).
    const links = new Map(els.map((e, i) => [r.ids[i], e.placeholderId] as const));
    const content = updateSlide(r.content, s.id, (sl) => ({ ...sl, elements: sl.elements.map((e) => (links.get(e.id) ? { ...e, placeholderId: links.get(e.id) } : e)) }));
    model.apply(() => content, { select: s.id === latest().selection.slideId ? { elementIds: r.ids } : { slideId: s.id, slideIds: [s.id], elementIds: r.ids } });
    opts.current.focusCanvas();
    return true;
  };

  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      if (alive.current) toast(messageOf(err), 'error');
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  const pictureInto = async (file: File, slideId: string | undefined, place: (pic: { width: number; height: number }) => { box: { x: number; y: number; w: number; h: number }; placeholderId?: string; fit?: ImageElement['fit'] }) => {
    if (!imageHost) return;
    const pic = await storePicture(imageHost, file);
    if (!alive.current) return;
    const where = place(pic);
    const el: ImageElement = { ...newImage(newId(), pic, where.box, altFromFileName(file.name)), ...(where.fit ? { fit: where.fit } : {}), ...(where.placeholderId ? { placeholderId: where.placeholderId } : {}) };
    if (!add([el], slideId)) throw new Error('There is no slide to put the picture on.');
  };

  const insertPicture = () =>
    void run(async () => {
      const s = currentSlide();
      const file = await choosePictureFile();
      if (!file || !alive.current) return;
      await pictureInto(file, s?.id, (pic) => ({ box: fitOnSlide(latest().content.size, pic) }));
    });

  const replacePicture = (id: string) =>
    void run(async () => {
      if (!imageHost) return;
      const file = await choosePictureFile();
      if (!file || !alive.current) return;
      const pic = await storePicture(imageHost, file);
      const found = findElement(id);
      if (!alive.current) return;
      if (!found || found.el.type !== 'image') throw new Error('The picture was removed meanwhile, so nothing was replaced.');
      // The new picture takes the old one's box (fitted the same way); its crop starts again.
      model.apply((c) =>
        updateElements(c, found.slide.id, [id], (e) => {
          if (e.type !== 'image') return e;
          const { crop: _drop, ...rest } = e;
          void _drop;
          return { ...rest, attachmentId: pic.attachmentId, mimeType: pic.mimeType, naturalWidth: pic.width, naturalHeight: pic.height };
        }),
      );
      toast('Picture replaced.', 'success');
    });

  const insertShape = (preset: ShapePreset) => {
    add([newShape(newId(), preset, latest().content.size)]);
  };

  const insertTable = (rows: number, columns: number) => {
    const size = latest().content.size;
    const w = Math.min(size.width * 0.8, columns * 140);
    const h = rows * 40;
    add([newTable(newId(), rows, columns, centred(size, w, h))]);
  };

  const insertChart = (type: ChartType) => {
    const size = latest().content.size;
    add([newChart(newId(), type, centred(size, Math.round(size.width * 0.6), Math.round(size.height * 0.6)))]);
  };

  const editAndInsert = async (start: PresentationDiagramStart | undefined, target?: { slideId?: string; placeholder?: Placeholder }) => {
    const host = diagramHost;
    if (!host) return;
    const diagram = await host.edit(null, start);
    if (!diagram) return;
    if (!alive.current) {
      host.settle?.(diagram, false);
      return;
    }
    const size = latest().content.size;
    const el = newDiagram(newId(), diagram, size, target?.placeholder ? placeholderBox(target.placeholder) : undefined);
    const placed = add([target?.placeholder ? { ...el, placeholderId: target.placeholder.id } : el], target?.slideId);
    // The app keeps the dialog's edits until it hears they are on a slide.
    host.settle?.(diagram, placed);
    if (!placed) throw new Error('There is no slide to put the diagram on. Your diagram was not inserted.');
    toast('Diagram added. Double-click it, or select it and press Enter, to edit it.', 'success');
  };

  const insertDiagram = (from: { templateId?: string; title?: string } | 'library' | 'file') =>
    void run(async () => {
      if (!diagramHost) return;
      const slideId = currentSlide()?.id;
      if (from === 'library' || from === 'file') {
        const start = from === 'library' ? await diagramHost.pickFromLibrary() : await diagramHost.importFile();
        if (start && alive.current) await editAndInsert(start, { slideId });
        return;
      }
      await editAndInsert(from.templateId || from.title ? from : undefined, { slideId });
    });

  const editDiagram = (id: string) =>
    void run(async () => {
      const host = diagramHost;
      const found = findElement(id);
      if (!host || !found || found.el.type !== 'diagram') return;
      const el = found.el;
      const current: PresentationEmbeddedDiagram = { source: el.source, previewId: el.previewId, naturalWidth: el.naturalWidth, naturalHeight: el.naturalHeight, title: el.title, svgPreviewId: el.svgPreviewId };
      const d = await host.edit(current);
      if (!d) return;
      const now = alive.current ? findElement(id) : null;
      if (!now || now.el.type !== 'diagram') {
        host.settle?.(d, false);
        if (alive.current) throw new Error('The diagram was removed from the slide while you were editing it, so your changes were not placed.');
        return;
      }
      model.apply((c) => updateElements(c, now.slide.id, [id], (e) => (e.type === 'diagram' ? withEditedDiagram(e, d) : e)));
      host.settle?.(d, true);
    });

  const fillPlaceholder = (p: Placeholder) => {
    const s = currentSlide();
    if (!s) return;
    const box = placeholderBox(p);
    if (p.kind === 'picture') {
      void run(async () => {
        const file = await choosePictureFile();
        if (!file || !alive.current) return;
        // A picture placeholder is filled edge to edge (the picture is cropped to it), as in PowerPoint.
        await pictureInto(file, s.id, () => ({ box, placeholderId: p.id, fit: 'cover' }));
      });
    } else if (p.kind === 'chart') add([{ ...newChart(newId(), 'column', box), placeholderId: p.id }], s.id);
    else if (p.kind === 'table') {
      const t = newTable(newId(), 3, 3, box);
      add([{ ...t, placeholderId: p.id }], s.id);
    }
  };

  const insertFiles = (files: File[], at?: Point) =>
    void run(async () => {
      const s = currentSlide();
      let offset = 0;
      for (const file of files) {
        await pictureInto(file, s?.id, (pic) => {
          const size = latest().content.size;
          const b = fitOnSlide(size, pic);
          const box = at ? { ...b, x: Math.round(at.x - b.w / 2 + offset), y: Math.round(at.y - b.h / 2 + offset) } : { ...b, x: b.x + offset, y: b.y + offset };
          offset += 16;
          return { box };
        });
        if (!alive.current) return;
      }
    });

  const pastePictures = (e: ClipboardEvent) => {
    if (!imageHost) return false;
    const files = pictureFiles(e.clipboardData);
    if (!files.length) return false;
    insertFiles(files);
    return true;
  };

  const dropFiles = (files: File[], at: Point) => {
    if (!imageHost) return toast('Pictures cannot be added here.', 'error');
    const pics = files.filter((f) => f.type.startsWith('image/'));
    if (!pics.length) return toast('Only pictures can be dropped on a slide.', 'error');
    insertFiles(pics, at);
  };

  const update = (id: string, change: (el: SlideElement) => SlideElement, group?: string) => {
    const s = currentSlide();
    if (!s) return;
    model.apply((c) => updateElements(c, s.id, [id], change), group ? { group } : {});
  };

  const open = (el: SlideElement, at?: Point, screen?: { x: number; y: number }) => {
    // A locked object's contents stay as they are (the object menu and the inspector disable these too).
    if (el.locked) return;
    if (el.type === 'shape' || el.type === 'table') editContents(el.id, at, screen);
    else if (el.type === 'chart') setChartId(el.id);
    else if (el.type === 'diagram' && diagramHost) editDiagram(el.id);
  };

  // ── Tables: rows as tall as their text ──────────────────────────────────────────────────────────
  // Rows are drawn at least as tall as stored; text that needs more makes them taller. After a change to a table on
  // the current slide (its text, a font, a narrower column…), the drawn rows are measured and the stored heights
  // follow as part of that change (amend), so the stored table, its box and the exports match what is drawn. Opening
  // a slide never changes it.
  const seenTables = useRef<{ slideId: string; tables: Map<string, TableElement> } | null>(null);
  useLayoutEffect(() => {
    if (!slide) return;
    const prev = seenTables.current;
    const tables = new Map(slide.elements.filter((e): e is TableElement => e.type === 'table').map((t) => [t.id, t]));
    seenTables.current = { slideId: slide.id, tables };
    if (!prev || prev.slideId !== slide.id) return;
    const stage = o.root.current?.querySelector('[data-stage]');
    if (!stage) return;
    const fixes = new Map<string, number[]>();
    for (const t of tables.values()) {
      if (prev.tables.get(t.id) === t) continue;
      const rows = Array.from(stage.querySelectorAll<HTMLTableRowElement>(`[data-element="${CSS.escape(t.id)}"] tr`));
      if (rows.length !== t.rows.length || !rows.some((r) => r.offsetHeight > 0)) continue;
      const heights = rows.map((r) => r.offsetHeight);
      if (setRowHeights(t, heights) !== t) fixes.set(t.id, heights);
    }
    if (fixes.size) model.apply((c) => updateElements(c, slide.id, fixes.keys(), (e) => (e.type === 'table' && fixes.has(e.id) ? setRowHeights(e, fixes.get(e.id)!) : e)), { amend: true });
  });

  // ── The edit layer ──────────────────────────────────────────────────────────────────────────────

  let layer: ReactNode = null;
  let draw: ((el: SlideElement) => SlideElement) | undefined;
  let textTarget: TextElement | null = null;
  if (edit && editTarget?.type === 'shape' && edit.kind === 'shape-text') {
    const t = shapeTextElement(editTarget);
    if (t) {
      textTarget = t;
      draw = (el) => (el.id === editTarget.id && el.type === 'shape' ? { ...el, text: emptyRichText() } : el);
      layer = (
        <ShapeTextOverlay
          key={`${edit.id}:${edit.session}`}
          shape={editTarget}
          text={t}
          theme={content.theme}
          caretAt={edit.caretAt}
          onText={(doc) => update(editTarget.id, (e) => (e.type === 'shape' ? { ...e, text: doc } : e), `shape-text:${edit.id}:${edit.session}`)}
          onNeedHeight={(needed) =>
            update(
              editTarget.id,
              (e) => {
                if (e.type !== 'shape' || e.textStyle?.autofit !== 'resize') return e;
                const ratio = shapeTextBox(e.preset, e.w, 100).h / 100;
                const h = Math.ceil(needed / Math.max(0.1, ratio));
                return Math.abs(h - e.h) > 1 ? { ...e, h } : e;
              },
              `shape-text:${edit.id}:${edit.session}`,
            )
          }
          onEditor={o.onEditor}
          onExit={() => {
            stop();
            o.focusCanvas();
          }}
        />
      );
    }
  } else if (edit && edit.kind === 'table' && editTarget?.type === 'table' && tableCellExists(editTarget, edit.cell)) {
    const table = editTarget;
    const cur = edit;
    draw = (el) => (el.id === table.id && el.type === 'table' ? setCellText(el, cur.cell, emptyRichText()) : el);
    layer = (
      <TableOverlay
        table={table}
        theme={content.theme}
        cell={cur.cell}
        range={rangeOf(cur.cell, cur.anchor)}
        session={cur.session}
        onCell={(cell, extend) => {
          model.endGroup();
          setEdit({ ...cur, cell, anchor: extend ? cur.anchor : cell });
        }}
        onText={(doc) => update(table.id, (e) => (e.type === 'table' ? setCellText(e, cur.cell, doc) : e), `table:${table.id}:${cur.cell.row}:${cur.cell.col}:${cur.session}`)}
        onNeedHeight={(h) =>
          update(
            table.id,
            (e) => {
              if (e.type !== 'table') return e;
              const box = cellBox(e, cur.cell);
              const row = e.rows[cur.cell.row];
              // The rows a cell spans share the extra height (the last of them takes it).
              const extra = h - box.h;
              if (!row || extra <= 1) return e;
              const last = cur.cell.row + (e.rows[cur.cell.row].cells[cur.cell.col].rowSpan ?? 1) - 1;
              return setRowHeights(e, e.rows.map((r, i) => (i === last ? r.height + extra : r.height)));
            },
            `table:${table.id}:${cur.cell.row}:${cur.cell.col}:${cur.session}`,
          )
        }
        onAddRow={() => {
          if (tableHasSpans(table)) return;
          model.endGroup();
          update(table.id, (e) => (e.type === 'table' ? insertRowAtEnd(e) : e));
          setEdit({ ...cur, cell: { row: table.rows.length, col: 0 }, anchor: { row: table.rows.length, col: 0 } });
        }}
        onEditor={o.onEditor}
        onExit={() => {
          stop();
          o.focusCanvas();
        }}
      />
    );
  }
  if (slide && !edit) {
    const empty = emptyPlaceholders(content, slide);
    if (empty.length) layer = <PlaceholderButtons placeholders={empty} canPictures={!!imageHost} busy={busy} onFill={fillPlaceholder} />;
  }

  // ── Object menu ─────────────────────────────────────────────────────────────────────────────────

  const menuItems = (selected: SlideElement[]): ContextMenuItem[] => {
    const el = selected.length === 1 ? selected[0] : null;
    if (!el) return [];
    const items: ContextMenuItem[] = [];
    if (el.type === 'image' && imageHost) items.push({ label: 'Replace picture…', disabled: el.locked || busy, onSelect: () => replacePicture(el.id) });
    if (el.type === 'chart') items.push({ label: 'Edit chart data…', disabled: el.locked, onSelect: () => setChartId(el.id) });
    if (el.type === 'diagram' && diagramHost) items.push({ label: 'Edit diagram…', disabled: el.locked || busy, onSelect: () => editDiagram(el.id) });
    if (el.type === 'table') items.push({ label: 'Edit cells', disabled: el.locked, onSelect: () => editContents(el.id) });
    if (el.type === 'shape' && el.preset !== 'line') items.push({ label: 'Edit text', disabled: el.locked, onSelect: () => editContents(el.id) });
    if (items.length) items[0] = { ...items[0], separator: true };
    return items;
  };

  const chart = chartId ? (findElementIn(content, chartId) as ChartElement | undefined) : undefined;
  const dialogs = chart ? (
    <ChartDataDialog
      key={chart.id}
      chart={chart}
      theme={content.theme}
      onClose={() => {
        setChartId(null);
        o.focusCanvas();
      }}
      onSave={(data) => {
        const found = findElement(chart.id);
        if (found)
          model.apply((c) =>
            updateElements(c, found.slide.id, [chart.id], (e) => {
              if (e.type !== 'chart') return e;
              const next: ChartElement = { ...e, ...data };
              // No slice colours of its own: the field is left out (not stored as undefined).
              if (!data.categoryColors) delete next.categoryColors;
              // Stacking needs two or more series.
              if (next.series.length < 2) delete next.stacked;
              return next;
            }),
          );
        setChartId(null);
        o.focusCanvas();
      }}
    />
  ) : null;

  return {
    canPictures: !!imageHost,
    canDiagrams: !!diagramHost,
    diagramTemplates: diagramHost?.templates ?? [],
    busy,
    insertPicture,
    insertShape,
    insertTable,
    insertChart,
    insertDiagram,
    replacePicture,
    editDiagram,
    editChartData: (id) => setChartId(id),
    editContents,
    open,
    fillPlaceholder,
    pastePictures,
    dropFiles,
    update,
    edit,
    stop,
    textTarget,
    layer,
    draw,
    menuItems,
    dialogs,
    content,
    slide,
  };
}

function findElementIn(content: PresentationContent, id: string): SlideElement | undefined {
  for (const s of content.slides) {
    const el = s.elements.find((e) => e.id === id);
    if (el) return el;
  }
  return undefined;
}

/** A point on the slide in an object's own (unturned) frame, relative to its top-left corner. */
function toLocal(el: SlideElement, p: Point): Point {
  const cx = el.x + el.w / 2;
  const cy = el.y + el.h / 2;
  const a = (-el.rotation * Math.PI) / 180;
  const dx = p.x - cx;
  const dy = p.y - cy;
  return { x: cx + dx * Math.cos(a) - dy * Math.sin(a) - el.x, y: cy + dx * Math.sin(a) + dy * Math.cos(a) - el.y };
}

const insertRowAtEnd = (t: TableElement) => insertRow(t, t.rows.length);

/** Tables resized with the handles: column widths and row heights follow the new box (one change with the resize). */
export function fitResizedTables(content: PresentationContent, slideId: string, ids: Iterable<string>): PresentationContent {
  return updateElements(content, slideId, ids, (e) => (e.type === 'table' ? fitTableToBox(e) : e));
}

/** True when the table still has the cell (rows and columns can be deleted while a cell is being edited). */
export function tableCellExists(table: TableElement, cell: CellRef): boolean {
  return !!table.rows[cell.row]?.cells[cell.col];
}

/** The nearest cell of the table to `cell` (the table must have at least one row). */
export function clampCell(table: TableElement, cell: CellRef): CellRef {
  const row = Math.max(0, Math.min(cell.row, table.rows.length - 1));
  const col = Math.max(0, Math.min(cell.col, (table.rows[row]?.cells.length ?? 1) - 1));
  return { row, col };
}
