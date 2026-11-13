import { Button, downloadBlob, Menu, safeFileName, useToast } from '@dcos/ui';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import { ChevronDown, Download, FileText, FileType, Printer } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { documentContentCss } from './contentCss';
import { exportDocx } from './export/docx';
import { printDocument } from './export/print';
import { documentToText } from './export/text';
import { documentExtensions } from './extensions';
import { readImageFile } from './image';
import { normalizeDocument, paperSize, type DocumentContent, type EditorMode, type PageSettings } from './types';
import { FindReplaceBar } from './ui/FindReplaceBar';
import { PageSetupDialog } from './ui/PageSetupDialog';
import { Toolbar } from './ui/Toolbar';

export interface DocumentEditorProps {
  /** Read once on mount. Remount (change `key`) to load different content. */
  initialContent: unknown;
  title: string;
  onChange: (content: DocumentContent) => void;
}

export function DocumentEditor({ initialContent, title, onChange }: DocumentEditorProps) {
  const [initial] = useState(() => normalizeDocument(initialContent));
  const [page, setPage] = useState<PageSettings>(initial.page);
  const [mode, setMode] = useState<EditorMode>(initial.mode);
  const [spellcheck, setSpellcheck] = useState(true);
  const [findOpen, setFindOpen] = useState(false);
  const [pageSetupOpen, setPageSetupOpen] = useState(false);
  const imageInput = useRef<HTMLInputElement>(null);
  const toast = useToast();

  const latest = useRef({ page, mode, onChange });
  latest.current = { page, mode, onChange };

  const extensions = useMemo(() => documentExtensions(), []);
  const editor = useEditor({
    extensions,
    content: initial.doc,
    editorProps: { attributes: { class: 'dcos-doc', spellcheck: 'true', 'aria-label': 'Document body', role: 'textbox', 'aria-multiline': 'true' } },
    onUpdate: ({ editor: e }) => {
      const { page: p, mode: m, onChange: cb } = latest.current;
      cb({ schemaVersion: 1, doc: e.getJSON(), page: p, mode: m });
    },
  });

  // Page settings and mode are part of the document too, so changing them saves.
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    if (editor) latest.current.onChange({ schemaVersion: 1, doc: editor.getJSON(), page, mode });
  }, [editor, page, mode]);

  useEffect(() => {
    editor?.view.dom.setAttribute('spellcheck', String(spellcheck));
  }, [editor, spellcheck]);

  const counts = useEditorState({
    editor,
    selector: ({ editor: e }) => (e ? { words: e.storage.characterCount.words(), chars: e.storage.characterCount.characters() } : { words: 0, chars: 0 }),
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
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      setMode('advanced');
      setFindOpen(true);
    }
    if (mod && e.key.toLowerCase() === 'p') {
      e.preventDefault();
      void printDocument(editor.view.dom, page, title);
    }
  };

  const content = (): DocumentContent => ({ schemaVersion: 1, doc: editor.getJSON(), page, mode });
  const base = safeFileName(title);

  const exportMenu = (
    <Menu
      align="end"
      trigger={(p) => (
        <Button size="sm" variant="primary" icon={<Download size={14} />} {...p}>
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
              downloadBlob(await exportDocx(content(), title), `${base}.docx`);
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
  const m = page.margins;
  const paperStyle = {
    '--paper-w': `${paper.width}mm`,
    '--paper-h': `${paper.height}mm`,
    '--m-top': `${m.top}mm`,
    '--m-right': `${m.right}mm`,
    '--m-bottom': `${m.bottom}mm`,
    '--m-left': `${m.left}mm`,
  } as CSSProperties;

  const footerPreview = [page.footer, page.pageNumbers ? 'Page 1' : ''].filter(Boolean).join('   ·   ');

  return (
    <div className="flex h-full flex-col" onKeyDown={onKeyDown}>
      <style>{documentContentCss + pageCss}</style>
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
      {findOpen && <FindReplaceBar editor={editor} onClose={() => setFindOpen(false)} />}

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
