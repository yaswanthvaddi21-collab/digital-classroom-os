import { Button, IconButton, Input } from '@dcos/ui';
import type { Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { getSearchState, replaceAll, replaceCurrent, setSearch, stepSearch } from '../extensions/searchReplace';

export function FindReplaceBar({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [term, setTerm] = useState('');
  const [replacement, setReplacement] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { count, index } = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const st = getSearchState(e.state);
      return { count: st.results.length, index: st.index };
    },
  });

  useEffect(() => {
    inputRef.current?.focus();
    return () => setSearch(editor, { term: '' });
  }, [editor]);

  useEffect(() => {
    setSearch(editor, { term, caseSensitive, index: 0 });
  }, [editor, term, caseSensitive]);

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface px-3 py-2" role="search">
      <div className="relative w-56">
        <Input
          ref={inputRef}
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              stepSearch(editor, e.shiftKey ? -1 : 1);
            }
            if (e.key === 'Escape') onClose();
          }}
          placeholder="Find"
          aria-label="Find"
          className="h-8 pr-16"
        />
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted" aria-live="polite">
          {term ? (count ? `${index + 1}/${count}` : '0/0') : ''}
        </span>
      </div>
      <IconButton label="Previous match (Shift+Enter)" disabled={!count} onClick={() => stepSearch(editor, -1)}>
        <ChevronUp size={16} />
      </IconButton>
      <IconButton label="Next match (Enter)" disabled={!count} onClick={() => stepSearch(editor, 1)}>
        <ChevronDown size={16} />
      </IconButton>
      <label className="flex items-center gap-1.5 text-xs text-muted">
        <input type="checkbox" checked={caseSensitive} onChange={(e) => setCaseSensitive(e.target.checked)} className="accent-[var(--dc-accent)]" />
        Match case
      </label>
      <div className="w-48">
        <Input value={replacement} onChange={(e) => setReplacement(e.target.value)} placeholder="Replace with" aria-label="Replace with" className="h-8" />
      </div>
      <Button size="sm" disabled={!count} onClick={() => replaceCurrent(editor, replacement)}>
        Replace
      </Button>
      <Button size="sm" disabled={!count} onClick={() => replaceAll(editor, replacement)}>
        Replace all
      </Button>
      <IconButton label="Close find" className="ml-auto" onClick={onClose}>
        <X size={16} />
      </IconButton>
    </div>
  );
}
