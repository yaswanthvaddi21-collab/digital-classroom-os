import { Button, downloadBlob, safeFileName, useToast } from '@dcos/ui';
import type { JSONContent } from '@tiptap/core';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import { FileArchive, FileJson, FileText, FileType, Printer, ShieldAlert } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { documentContentCss } from './contentCss';
import { exportDocx } from './export/docx';
import { exportOdt } from './export/odt'; // G-FILES
import { DCOSDOC_EXTENSION, exportDcosdoc } from './export/dcosdoc'; // Phase 6
import { collectPrintDiagrams, PRINT_ONE_PLACEHOLDER, PRINT_PLACEHOLDERS, printDocument } from './export/print';
import { marginBoxSupport } from './export/printSupport';
import { ExportReport, exportToast } from './export/report';
import { documentToText } from './export/text';
import { documentExtensions } from './extensions';
import type { DiagramHost } from './extensions/diagramEmbed';
import { sectionAt } from './extensions/sectionBreak';
import { inlineRemoteImage, readImageFile } from './image';
import { contentSchemaFor } from './migrate';
import { commentsAppendix } from './review/comments';
import { CommentsLayer } from './review/CommentsPanel';
import { useReviewControls, useReviewState, withReviewFields } from './review/useReview';
import { prepareDocument } from './safety';
import { CONTENT_FIELDS, paperSize, type DocumentContent, type EditorMode, type PageSettings } from './types';
import { ExportMenu } from './ui/ExportMenu';
import { FindReplaceBar } from './ui/FindReplaceBar';
import { PageSetupDialog } from './ui/PageSetupDialog';
import { PaperFooter, PaperHeader, usesHeaderFooter } from './ui/PaperChrome'; // G-LAYOUT
import { OPEN_LINK_EVENT, type RibbonContext } from './ui/ribbon/context';
import { Ribbon } from './ui/ribbon/Ribbon';
import { Ruler } from './ui/ribbon/format/Ruler'; // G-FORMAT

export interface DocumentEditorProps {
  /** Read once on mount. Remount (change `key`) to load different content. */
  initialContent: unknown;
  title: string;
  onChange: (content: DocumentContent) => void;
  /** Enables embedded diagrams (the Diagram tab, editing, previews). Supplied by the app. */
  diagramHost?: DiagramHost;
  // @phase4:review — per-device preferences the app passes in (Settings → General).
  /** Name new comments are written under. */
  authorName?: string;
  /** Whether spell checking starts on (remembered by the app); defaults to on. */
  spellcheck?: boolean;
  /** Called when the user turns spell checking on or off, so the app can remember it. */
  onSpellcheckChange?: (on: boolean) => void;
}

/**
 * Opens a stored document. Content the editor can represent exactly is editable. Anything else (content from a
 * newer app version, or content the schema rejects) opens in a protected read-only view and is never saved over.
 */
export function DocumentEditor({ initialContent, title, onChange, diagramHost, ...prefs }: DocumentEditorProps) {
  const [prepared] = useState(() => prepareDocument(initialContent));
  if (prepared.state === 'editable')
    return <DocumentWorkspace content={prepared.content} title={title} onChange={onChange} repaired={prepared.repairs.length > 0} diagramHost={diagramHost} prefs={prefs} />;
  return (
    <DocumentWorkspace
      content={prepared.display}
      title={title}
      diagramHost={diagramHost}
      prefs={prefs}
      protectedView={{ reason: prepared.reason, detail: prepared.detail, original: initialContent }}
    />
  );
}

interface ProtectedView {
  reason: 'newer' | 'invalid';
  detail: string;
  original: unknown;
}

function DocumentWorkspace({
  content: initial,
  title,
  onChange,
  protectedView,
  repaired = false,
  diagramHost,
  prefs = {},
}: {
  content: DocumentContent;
  title: string;
  onChange?: (c: DocumentContent) => void;
  protectedView?: ProtectedView;
  repaired?: boolean;
  diagramHost?: DiagramHost;
  prefs?: Pick<DocumentEditorProps, 'authorName' | 'spellcheck' | 'onSpellcheckChange'>;
}) {
  const [tab, setTab] = useState('home');
  const [showRepaired, setShowRepaired] = useState(repaired);
  const readOnly = !!protectedView;
  const [contentError, setContentError] = useState<string | null>(null);
  const blocked = useRef(readOnly);
  const [page, setPage] = useState<PageSettings>(initial.page);
  const [mode, setMode] = useState<EditorMode>(initial.mode);
  const [spellcheck, setSpellcheck] = useState(prefs.spellcheck ?? true);
  // @phase4:review — follow the remembered setting when it changes elsewhere (Settings, another tab).
  useEffect(() => {
    if (prefs.spellcheck !== undefined) setSpellcheck(prefs.spellcheck);
  }, [prefs.spellcheck]);
  const [findOpen, setFindOpen] = useState(false);
  const [pageSetupOpen, setPageSetupOpen] = useState(false);
  const imageInput = useRef<HTMLInputElement>(null);
  const toast = useToast();

  // Top-level fields later features keep beside the body (registered in CONTENT_FIELDS); carried through every save.
  const [storedExtras] = useState(() => Object.fromEntries(Object.keys(CONTENT_FIELDS).filter((k) => (initial as unknown as Record<string, unknown>)[k] !== undefined).map((k) => [k, (initial as unknown as Record<string, unknown>)[k]])));
  // @phase4:review — comments and the document language are edited here, so they replace their stored values.
  const review = useReviewState(initial);
  const extras = useMemo(() => withReviewFields(storedExtras, review.fields), [storedExtras, review.fields]);
  const latest = useRef({ page, mode, onChange, extras });
  latest.current = { page, mode, onChange, extras };
  /** Prints with the current settings (Export menu and Ctrl/⌘+P); set on every render below. */
  const printNow = useRef<() => void>(() => undefined);

  const extensions = useMemo(() => documentExtensions({ diagramHost: diagramHost ?? null, inlineRemoteImage: readOnly ? null : (src) => inlineRemoteImage(src) }), [diagramHost, readOnly]);
  const editor = useEditor({
    extensions,
    content: initial.doc,
    editable: !readOnly,
    // Never let the editor silently replace content it cannot parse with an empty document (audit C-1).
    enableContentCheck: true,
    onContentError: ({ error }) => {
      blocked.current = true;
      setContentError(error.message);
    },
    editorProps: { attributes: { class: 'dcos-doc', spellcheck: 'true', 'aria-label': 'Document body', role: 'textbox', 'aria-multiline': 'true' } },
    onUpdate: ({ editor: e }) => {
      if (blocked.current) return;
      const { page: p, mode: m, onChange: cb, extras: x } = latest.current;
      cb?.(compose(e.getJSON(), p, m, x));
    },
  });

  // Page settings and mode are part of the document too, so changing them saves. Compared with the opening
  // values (not a first-run flag) so React StrictMode's repeated effects never count as an edit.
  useEffect(() => {
    if (page === initial.page && mode === initial.mode) return;
    if (editor && !blocked.current) latest.current.onChange?.(compose(editor.getJSON(), page, mode, latest.current.extras));
  }, [editor, page, mode, initial.page, initial.mode]);

  // @phase4:review — comments and the language save like page settings (only after a change in this session).
  const reviewControls = useReviewControls(editor, review, { authorName: prefs.authorName, readOnly: readOnly || !!contentError });
  useEffect(() => {
    if (!review.changed) return;
    if (editor && !blocked.current) latest.current.onChange?.(compose(editor.getJSON(), latest.current.page, latest.current.mode, latest.current.extras));
  }, [editor, review.changed, review.fields]);

  // Ctrl/⌘+P prints from anywhere on the page, not only when focus is inside the editor.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'p' && editor) {
        e.preventDefault();
        printNow.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editor, title]);

  // The view may not be mounted yet (the editor is created before EditorContent attaches it), so apply on mount too.
  useEffect(() => {
    if (!editor) return;
    const apply = () => {
      if (editor.isDestroyed) return;
      let dom: HTMLElement;
      try {
        dom = editor.view.dom; // throws until EditorContent has mounted the view; the 'mount' listener retries
      } catch {
        return;
      }
      dom.setAttribute('spellcheck', String(spellcheck));
    };
    apply();
    editor.on('mount', apply);
    return () => {
      editor.off('mount', apply);
    };
  }, [editor, spellcheck]);

  const counts = useEditorState({
    editor,
    // The selector can run against an editor that React has just torn down (Suspense, StrictMode); its storage is gone then.
    selector: ({ editor: e }) => {
      const count = e && !e.isDestroyed ? e.storage.characterCount : undefined;
      return count ? { words: count.words(), chars: count.characters() } : { words: 0, chars: 0 };
    },
  });

  const insertImage = useCallback(
    async (file: File) => {
      if (!editor) return;
      try {
        const img = await readImageFile(file);
        editor.chain().focus().setImage({ src: img.src, alt: file.name.replace(/\.[^.]+$/, ''), width: img.width, height: img.height }).run();
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Could not insert image', 'error');
      }
    },
    [editor, toast],
  );

  if (!editor) return null;

  const onKeyDown = (e: KeyboardEvent) => {
    // Opening Find is a view action: it must not change the document's mode or save anything.
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f' && !readOnly) {
      e.preventDefault();
      setFindOpen(true);
    }
    // Ctrl/⌘+K: insert or edit a link (the Link control lives on the Insert tab).
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' && !readOnly) {
      e.preventDefault();
      setTab('insert');
      requestAnimationFrame(() => window.dispatchEvent(new Event(OPEN_LINK_EVENT)));
    }
  };

  const content = (): DocumentContent => compose(editor.getJSON(), page, mode, extras);
  const base = safeFileName(title);

  // Header, footer and page numbers are drawn by the browser's print engine (CSS page margin boxes).
  const marginBoxes = marginBoxSupport();
  const usesMarginBoxes = usesHeaderFooter(page); // G-LAYOUT: left/right and first-page parts count too
  printNow.current = () => {
    if (usesMarginBoxes && marginBoxes === 'no') toast(PRINT_WITHOUT_MARGIN_BOXES, 'info');
    // Phase 6: diagrams print as their SVG drawing; one with no picture at all prints as neutral text, and is reported.
    void (async () => {
      const diagrams = await collectPrintDiagrams(editor.view, diagramHost);
      const { placeholders } = await printDocument(editor.view.dom, page, title, diagrams);
      if (placeholders) toast(placeholders === 1 ? PRINT_ONE_PLACEHOLDER : PRINT_PLACEHOLDERS.replace('{n}', String(placeholders)), 'info');
    })();
  };
  // Phase 6 (ADR 0013): the exporters draw missing previews and SVG drawings with the host's off-screen renderer.
  const diagramExport = { renderPreview: diagramHost?.renderPreview ? (source: unknown, name?: string) => diagramHost.renderPreview!(source, name) : undefined };

  const exportMenu = (
    <ExportMenu
      items={[
        {
          label: 'PDF (print / save as PDF)',
          icon: <Printer size={14} />,
          hint: '⌘P',
          description: `Opens your browser's print dialog; choose “Save as PDF”.${
            usesMarginBoxes ? (marginBoxes === 'no' ? ' This browser leaves out the header, footer and page numbers; they need a recent Chrome or Edge.' : ' The header, footer and page numbers need a recent Chrome or Edge.') : ''
          }`,
          onSelect: () => printNow.current(),
        },
        {
          label: 'Word document (.docx)',
          icon: <FileType size={14} />,
          onSelect: async () => {
            try {
              const report = new ExportReport();
              downloadBlob(await exportDocx(content(), title, diagramHost?.loadPreview, report, diagramExport), `${base}.docx`);
              const { message, kind } = exportToast('Word document', report);
              toast(message, kind);
            } catch (err) {
              toast(`DOCX export failed: ${err instanceof Error ? err.message : String(err)}`, 'error');
            }
          },
        },
        {
          label: 'Plain text (.txt)',
          icon: <FileText size={14} />,
          // @phase4:review — comments are listed after the text.
          onSelect: () => {
            const json = editor.getJSON();
            const appendix = commentsAppendix(review.comments, json);
            downloadBlob(new Blob([documentToText(json) + (appendix ? `\n${appendix}` : '')], { type: 'text/plain;charset=utf-8' }), `${base}.txt`);
          },
        },
        // G-FILES: OpenDocument text, for LibreOffice and other word processors; what it leaves out is in the toast.
        {
          label: 'OpenDocument text (.odt)',
          icon: <FileType size={14} />,
          onSelect: async () => {
            try {
              const report = new ExportReport();
              downloadBlob(await exportOdt(content(), title, diagramHost?.loadPreview, report, diagramExport), `${base}.odt`);
              const { message, kind } = exportToast('OpenDocument text', report);
              toast(message, kind);
            } catch (err) {
              toast(`ODT export failed: ${err instanceof Error ? err.message : String(err)}`, 'error');
            }
          },
        },
        // @phase4:export-menu — further export formats (e.g. ODT) go here; report approximations with exportToast.
        // Phase 6 (ADR 0013): the document with everything it needs (diagram data and previews), to move it without loss.
        {
          label: `Classroom OS document (${DCOSDOC_EXTENSION})`,
          icon: <FileArchive size={14} />,
          description: 'Everything in this document, with editable diagrams, for importing into Classroom OS on another device.',
          onSelect: async () => {
            try {
              const report = new ExportReport();
              downloadBlob(await exportDcosdoc(content(), title, diagramHost?.loadPreview, report, diagramExport), `${base}${DCOSDOC_EXTENSION}`);
              const { message, kind } = exportToast('Classroom OS document', report);
              toast(message, kind);
            } catch (err) {
              toast(`Export failed: ${err instanceof Error ? err.message : String(err)}`, 'error');
            }
          },
        },
      ]}
    />
  );

  const paper = paperSize(page);
  // Text width of the page in CSS pixels (96 per inch): embedded diagrams are never wider than this.
  const textWidthPx = Math.round(((paper.width - page.margins.left - page.margins.right) / 25.4) * 96);
  const m = page.margins;
  const paperStyle = {
    '--paper-w': `${paper.width}mm`,
    '--paper-h': `${paper.height}mm`,
    '--m-top': `${m.top}mm`,
    '--m-right': `${m.right}mm`,
    '--m-bottom': `${m.bottom}mm`,
    '--m-left': `${m.left}mm`,
  } as CSSProperties;

  const ribbon: RibbonContext = {
    editor,
    mode,
    advanced: mode === 'advanced',
    page,
    textWidthPx,
    diagramHost,
    spellcheck,
    onInsertImage: () => imageInput.current?.click(),
    onToggleFind: () => setFindOpen((o) => !o),
    onPageSetup: () => setPageSetupOpen(true),
    onToggleSpellcheck: () => {
      setSpellcheck(!spellcheck);
      prefs.onSpellcheckChange?.(!spellcheck);
    },
    showTab: setTab,
    review: reviewControls,
    // @phase4:ribbon-context — fill in new ribbon context fields here.
    onPageChange: setPage, // G-LAYOUT
  };

  const protectedNotice = protectedView ?? (contentError ? { reason: 'invalid' as const, detail: contentError, original: initial } : null);

  return (
    <div className="flex h-full flex-col" onKeyDown={onKeyDown}>
      <style>{documentContentCss + pageCss}</style>
      {protectedNotice ? (
        <ProtectedBanner notice={protectedNotice} title={title} />
      ) : (
      <Ribbon
        ctx={ribbon}
        tab={tab}
        exportMenu={exportMenu}
        onModeChange={(next) => {
          setMode(next);
          if (next === 'simple') setFindOpen(false);
        }}
      />
      )}
      {showRepaired && !protectedNotice && (
        <div role="status" className="flex items-center gap-3 border-b border-accent/20 bg-accent-soft px-4 py-2 text-sm">
          <span className="flex-1">This document had a formatting fault from an earlier version that hid its contents. It has been repaired, and all of its text is here.</span>
          <Button size="sm" variant="ghost" onClick={() => setShowRepaired(false)}>
            Dismiss
          </Button>
        </div>
      )}
      {findOpen && !protectedNotice && <FindReplaceBar editor={editor} onClose={() => setFindOpen(false)} />}
      {/* @phase4:format-ruler (G-FORMAT): the ruler (Advanced mode; hidden on narrow screens, where the Paragraph dialog does the same). */}
      {!protectedNotice && mode === 'advanced' && <Ruler editor={editor} page={page} onPageChange={setPage} />}

      {/* @phase4:review — the comments panel sits beside the page (over it on narrow screens). */}
      <div className="relative flex min-h-0 flex-1">
      <div
        className="dcos-canvas min-h-0 min-w-0 flex-1 overflow-y-auto bg-canvas"
        onDragOver={(e) => e.dataTransfer.types.includes('Files') && e.preventDefault()}
        onDrop={(e) => {
          const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith('image/'));
          if (file) {
            e.preventDefault();
            void insertImage(file);
          }
        }}
      >
        <div className="dcos-paper" style={paperStyle} onClick={(e) => e.target === e.currentTarget && editor.commands.focus('end')}>
          {/* G-LAYOUT: header and footer previews (left, centre and right parts; the editor shows one continuous sheet, so "#" stands for the page number). */}
          <PaperHeader page={page} />
          <EditorContent editor={editor} />
          <PaperFooter page={page} />
        </div>
      </div>
      <CommentsLayer editor={editor} controls={reviewControls} />
      </div>

      <div className="flex h-8 shrink-0 items-center gap-4 border-t border-border bg-surface px-4 text-xs text-muted">
        <span>
          {counts.words.toLocaleString()} words · {counts.chars.toLocaleString()} characters
        </span>
        <span className="hidden sm:inline">
          {page.size} {page.orientation}
        </span>
        <span className="ml-auto hidden md:inline">Works offline · Ctrl/⌘+S saves a version</span>
      </div>

      <input
        ref={imageInput}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void insertImage(f);
          e.target.value = '';
        }}
      />
      {pageSetupOpen && <PageSetupDialog page={page} breaks={editor && !editor.isDestroyed ? sectionAt(editor.state).breaks.map((b) => ({ ...b.node.attrs })) : []} onApply={setPage} onClose={() => setPageSetupOpen(false)} />}
    </div>
  );
}

export const PRINT_WITHOUT_MARGIN_BOXES = "This browser's print dialog leaves out the header, footer and page numbers. They need a recent Chrome or Edge.";

/**
 * The stored form of what is on screen: the body, the page settings and mode, and any top-level fields later
 * features keep, with the content schema it needs (1 while it uses only what v0.1.0 knew).
 */
function compose(doc: JSONContent, page: PageSettings, mode: EditorMode, extras: Record<string, unknown>): DocumentContent {
  const content = { ...extras, doc, page, mode };
  // @phase4:document-content — features with their own top-level state add it to `content` here.
  return { ...content, schemaVersion: contentSchemaFor(content) };
}

function ProtectedBanner({ notice, title }: { notice: ProtectedView; title: string }) {
  return (
    <div role="alert" className="flex flex-wrap items-start gap-3 border-b border-warning/30 bg-warning/10 px-4 py-3 text-sm">
      <ShieldAlert size={18} className="mt-0.5 shrink-0 text-warning" />
      <div className="min-w-0 flex-1">
        <div className="font-semibold">Opened read-only to protect this document</div>
        <p className="mt-0.5 text-muted">
          {notice.reason === 'newer'
            ? 'It was saved by a newer version of Classroom OS. Update the app on this device to edit it.'
            : 'It contains content this version cannot display exactly.'}{' '}
          Nothing has been changed or saved. What you see below may be simplified.
        </p>
        <p className="mt-1 font-mono text-xs text-muted">{notice.detail}</p>
      </div>
      <Button
        size="sm"
        icon={<FileJson size={14} />}
        onClick={() => downloadBlob(new Blob([JSON.stringify(notice.original, null, 2)], { type: 'application/json' }), `${safeFileName(title)} (original data).json`)}
      >
        Download original data
      </Button>
    </div>
  );
}

/** Editor-only page chrome: the white sheet on a grey desk, sized from the page settings. */
const pageCss = `
.dcos-canvas { padding: 32px 16px 64px; }
.dcos-paper {
  position: relative;
  box-sizing: border-box;
  width: var(--paper-w);
  max-width: 100%;
  min-height: var(--paper-h);
  margin: 0 auto;
  padding: var(--m-top) var(--m-right) var(--m-bottom) var(--m-left);
  background: #fff;
  border-radius: 4px;
  box-shadow: 0 1px 2px rgba(0,0,0,.06), 0 8px 28px rgba(0,0,0,.08);
  cursor: text;
}
.dark .dcos-paper { box-shadow: 0 0 0 1px rgba(255,255,255,.06), 0 12px 40px rgba(0,0,0,.5); }
.dcos-paper .ProseMirror { min-height: 60vh; }
.dcos-paper-header, .dcos-paper-footer {
  position: absolute; left: var(--m-left); right: var(--m-right);
  text-align: center; font: 9pt Carlito, Calibri, Arial, sans-serif; color: #8a8a96; pointer-events: none;
}
.dcos-paper-header { top: calc(var(--m-top) / 2 - 0.6em); }
.dcos-paper-footer { bottom: calc(var(--m-bottom) / 2 - 0.6em); }
@media (max-width: 640px) {
  .dcos-canvas { padding: 12px 8px 48px; }
  .dcos-paper { padding: 28px 20px; min-height: auto; }
  .dcos-paper-header { top: 8px; } .dcos-paper-footer { bottom: 8px; }
}
`;
