import { Button, downloadBlob, Menu, safeFileName, useToast } from '@dcos/ui';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import { ChevronDown, Download, FileJson, FileText, FileType, Printer, ShieldAlert } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { documentContentCss } from './contentCss';
import { exportDocx } from './export/docx';
import { printDocument } from './export/print';
import { documentToText } from './export/text';
import { documentExtensions } from './extensions';
import { readImageFile } from './image';
import { schemaFor } from './migrate';
import { prepareDocument } from './safety';
import { paperSize, type DocumentContent, type EditorMode, type PageSettings } from './types';
import { FindReplaceBar } from './ui/FindReplaceBar';
import { PageSetupDialog } from './ui/PageSetupDialog';
import { DiagramRibbon } from './ui/DiagramRibbon';
import { OPEN_LINK_EVENT, Toolbar } from './ui/Toolbar';
import type { DiagramHost } from './extensions/diagramEmbed';

export interface DocumentEditorProps {
  /** Read once on mount. Remount (change `key`) to load different content. */
  initialContent: unknown;
  title: string;
  onChange: (content: DocumentContent) => void;
  /** Enables embedded diagrams (the Diagram tab, editing, previews). Supplied by the app. */
  diagramHost?: DiagramHost;
}

/**
 * Opens a stored document. Content the editor can represent exactly is editable. Anything else (content from a
 * newer app version, or content the schema rejects) opens in a protected read-only view and is never saved over.
 */
export function DocumentEditor({ initialContent, title, onChange, diagramHost }: DocumentEditorProps) {
  const [prepared] = useState(() => prepareDocument(initialContent));
  if (prepared.state === 'editable')
    return <DocumentWorkspace content={prepared.content} title={title} onChange={onChange} repaired={prepared.repairs.length > 0} diagramHost={diagramHost} />;
  return (
    <DocumentWorkspace
      content={prepared.display}
      title={title}
      diagramHost={diagramHost}
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
}: {
  content: DocumentContent;
  title: string;
  onChange?: (c: DocumentContent) => void;
  protectedView?: ProtectedView;
  repaired?: boolean;
  diagramHost?: DiagramHost;
}) {
  const [tab, setTab] = useState<'home' | 'diagram'>('home');
  const [showRepaired, setShowRepaired] = useState(repaired);
  const readOnly = !!protectedView;
  const [contentError, setContentError] = useState<string | null>(null);
  const blocked = useRef(readOnly);
  const [page, setPage] = useState<PageSettings>(initial.page);
  const [mode, setMode] = useState<EditorMode>(initial.mode);
  const [spellcheck, setSpellcheck] = useState(true);
  const [findOpen, setFindOpen] = useState(false);
  const [pageSetupOpen, setPageSetupOpen] = useState(false);
  const imageInput = useRef<HTMLInputElement>(null);
  const toast = useToast();

  const latest = useRef({ page, mode, onChange });
  latest.current = { page, mode, onChange };

  const extensions = useMemo(() => documentExtensions({ diagramHost: diagramHost ?? null }), [diagramHost]);
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
      const { page: p, mode: m, onChange: cb } = latest.current;
      const doc = e.getJSON();
      cb?.({ schemaVersion: schemaFor(doc), doc, page: p, mode: m });
    },
  });

  // Page settings and mode are part of the document too, so changing them saves. Compared with the opening
  // values (not a first-run flag) so React StrictMode's repeated effects never count as an edit.
  useEffect(() => {
    if (page === initial.page && mode === initial.mode) return;
    if (editor && !blocked.current) {
      const doc = editor.getJSON();
      latest.current.onChange?.({ schemaVersion: schemaFor(doc), doc, page, mode });
    }
  }, [editor, page, mode, initial.page, initial.mode]);

  // Ctrl/⌘+P prints from anywhere on the page, not only when focus is inside the editor.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'p' && editor) {
        e.preventDefault();
        void printDocument(editor.view.dom, latest.current.page, title);
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
    // Ctrl/⌘+K: insert or edit a link (the Link control lives on the Home tab).
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' && !readOnly) {
      e.preventDefault();
      setTab('home');
      requestAnimationFrame(() => window.dispatchEvent(new Event(OPEN_LINK_EVENT)));
    }
  };

  const content = (): DocumentContent => {
    const doc = editor.getJSON();
    return { schemaVersion: schemaFor(doc), doc, page, mode };
  };
  const base = safeFileName(title);

  const exportMenu = (
    <Menu
      align="end"
      trigger={(p) => (
        <Button size="sm" variant="primary" icon={<Download size={14} />} aria-label="Export" {...p}>
          <span className="hidden sm:inline">Export</span> <ChevronDown size={13} />
        </Button>
      )}
      items={[
        {
          label: 'PDF (print / save as PDF)',
          icon: <Printer size={14} />,
          hint: '⌘P',
          onSelect: () => void printDocument(editor.view.dom, page, title),
        },
        {
          label: 'Word document (.docx)',
          icon: <FileType size={14} />,
          onSelect: async () => {
            try {
              downloadBlob(await exportDocx(content(), title, diagramHost?.loadPreview), `${base}.docx`);
              toast('Exported Word document', 'success');
            } catch (err) {
              toast(`DOCX export failed: ${err instanceof Error ? err.message : String(err)}`, 'error');
            }
          },
        },
        {
          label: 'Plain text (.txt)',
          icon: <FileText size={14} />,
          onSelect: () => downloadBlob(new Blob([documentToText(editor.getJSON())], { type: 'text/plain;charset=utf-8' }), `${base}.txt`),
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

  // The editor shows one continuous sheet, so this is a preview of the footer text, not a page count.
  const footerPreview = [page.footer, page.pageNumbers ? 'Page # of #' : ''].filter(Boolean).join('   ·   ');
  const protectedNotice = protectedView ?? (contentError ? { reason: 'invalid' as const, detail: contentError, original: initial } : null);

  return (
    <div className="flex h-full flex-col" onKeyDown={onKeyDown}>
      <style>{documentContentCss + pageCss}</style>
      {protectedNotice ? (
        <ProtectedBanner notice={protectedNotice} title={title} />
      ) : (
      <>
      {diagramHost && (
        <div role="tablist" aria-label="Toolbar" className="flex items-end gap-1 border-b border-border bg-surface-2/50 px-2 pt-1">
          {(
            [
              ['home', 'Home'],
              ['diagram', 'Diagram'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={
                tab === id
                  ? '-mb-px rounded-t-md border border-b-surface border-border bg-surface px-3 py-1 text-xs font-semibold text-fg'
                  : 'rounded-t-md px-3 py-1 text-xs font-medium text-muted hover:text-fg'
              }
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {tab === 'diagram' && diagramHost ? (
        <DiagramRibbon editor={editor} host={diagramHost} maxWidth={textWidthPx} mode={mode} onModeChange={setMode} exportMenu={exportMenu} />
      ) : (
      <Toolbar
        editor={editor}
        mode={mode}
        onModeChange={(next) => {
          setMode(next);
          if (next === 'simple') setFindOpen(false);
        }}
        onInsertImage={() => imageInput.current?.click()}
        onToggleFind={() => setFindOpen((o) => !o)}
        onPageSetup={() => setPageSetupOpen(true)}
        spellcheck={spellcheck}
        onToggleSpellcheck={() => setSpellcheck((v) => !v)}
        exportMenu={exportMenu}
      />
      )}
      </>
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

      <div
        className="dcos-canvas min-h-0 flex-1 overflow-y-auto bg-canvas"
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
          {page.header && <div className="dcos-paper-header">{page.header}</div>}
          <EditorContent editor={editor} />
          {footerPreview && <div className="dcos-paper-footer">{footerPreview}</div>}
        </div>
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
      {pageSetupOpen && <PageSetupDialog page={page} onApply={setPage} onClose={() => setPageSetupOpen(false)} />}
    </div>
  );
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
