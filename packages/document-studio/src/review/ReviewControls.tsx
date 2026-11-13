import { Button, Dialog, IconButton, Select } from '@dcos/ui';
import type { Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import { ChevronDown, ChevronUp, Languages, MessageSquare, MessageSquarePlus, PanelRight, Sigma } from 'lucide-react';
import { useState } from 'react';
import { DOCUMENT_LANGUAGES, languageLabel } from './language';
import type { ReviewControls } from './useReview';
import { textStats, type TextStats } from './wordCount';

const fmt = (n: number) => n.toLocaleString();

/** Word count dialog: words, characters with and without spaces and paragraphs, for the document and the selection. */
export function WordCountButton({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const stats = useEditorState({
    editor,
    selector: ({ editor: e }): { doc: TextStats; selection: TextStats | null } | null => {
      if (!open || !e || e.isDestroyed) return null;
      const { from, to, empty } = e.state.selection;
      return { doc: textStats(e.state.doc), selection: empty ? null : textStats(e.state.doc, from, to) };
    },
    equalityFn: (a, b) => JSON.stringify(a) === JSON.stringify(b),
  });
  const rows: Array<[string, keyof TextStats]> = [
    ['Words', 'words'],
    ['Characters', 'characters'],
    ['Characters (no spaces)', 'charactersNoSpaces'],
    ['Paragraphs', 'paragraphs'],
  ];
  return (
    <>
      <Button size="sm" variant="ghost" icon={<Sigma size={15} />} aria-haspopup="dialog" onClick={() => setOpen(true)}>
        Word count
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Word count" size="sm" footer={<Button onClick={() => setOpen(false)}>Close</Button>}>
        {stats && (
          <>
            <div className="mb-1 grid grid-cols-[1fr_5rem_5rem] gap-x-4 text-xs font-medium text-muted" aria-hidden="true">
              <span />
              <span className="text-right">Document</span>
              <span className="text-right">Selection</span>
            </div>
            <dl className="grid grid-cols-[1fr_5rem_5rem] gap-x-4 gap-y-1.5 text-sm" aria-label="Word count">
              {rows.map(([label, key]) => (
                <div key={key} className="contents">
                  <dt className="text-muted">{label}</dt>
                  <dd className="text-right tabular-nums" aria-label={`${label} in the document`}>
                    {fmt(stats.doc[key])}
                  </dd>
                  <dd className="text-right tabular-nums text-muted" aria-label={`${label} in the selection`}>
                    {stats.selection ? fmt(stats.selection[key]) : '—'}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-xs text-muted">{stats.selection ? 'Selection counts are for the text selected in the document.' : 'Select text in the document to count part of it.'}</p>
          </>
        )}
      </Dialog>
    </>
  );
}

/** The document language, which the browser's spell checker follows where supported (and Word on export). */
export function LanguagePicker({ review }: { review: ReviewControls }) {
  const value = review.state.language ?? '';
  const listed = DOCUMENT_LANGUAGES.some((l) => l.tag === value);
  return (
    <label className="flex items-center gap-1.5 text-xs text-muted" title="Document language (spell check and Word export)">
      <Languages size={15} aria-hidden="true" />
      <Select aria-label="Document language" value={value} onChange={(e) => review.state.setLanguage(e.target.value || null)} className="h-8 max-w-44">
        <option value="">Language: not set</option>
        {!listed && value && <option value={value}>{languageLabel(value)}</option>}
        {DOCUMENT_LANGUAGES.map((l) => (
          <option key={l.tag} value={l.tag}>
            {l.label}
          </option>
        ))}
      </Select>
    </label>
  );
}

/** Review tab: the Comments group. */
export function CommentsGroup({ review }: { review: ReviewControls }) {
  const open = review.state.comments.filter((t) => !t.resolved).length;
  return (
    <>
      <Button size="sm" variant="ghost" icon={<MessageSquarePlus size={15} />} disabled={!review.canComment} onClick={review.startComment} title={review.canComment ? 'New comment on the selected text (Ctrl+Alt+M)' : `New comment: ${review.commentHint ?? 'select some text first.'}`}>
        New comment
      </Button>
      <IconButton label="Previous comment" disabled={!open} onClick={() => review.step(-1)}>
        <ChevronUp size={16} />
      </IconButton>
      <IconButton label="Next comment" disabled={!open} onClick={() => review.step(1)}>
        <ChevronDown size={16} />
      </IconButton>
      <IconButton label={review.panelOpen ? 'Hide comments' : 'Show comments'} active={review.panelOpen} onClick={() => review.setPanelOpen(!review.panelOpen)}>
        {review.panelOpen ? <PanelRight size={16} /> : <MessageSquare size={16} />}
      </IconButton>
    </>
  );
}
