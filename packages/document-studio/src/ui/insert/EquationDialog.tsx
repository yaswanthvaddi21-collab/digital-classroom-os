import { Button, Dialog, cn } from '@dcos/ui';
import type { Editor } from '@tiptap/core';
import katex from 'katex';
import { useEffect, useMemo, useRef, useState } from 'react';
import { isEquation, KATEX_OPTIONS, writeEquation } from '../../extensions/equation';
import { equationHasColour, wordEquation } from '../../export/docx/insert';

/** What the dialog works on: a new equation, or the equation at `pos`. */
export type EquationTarget = { mode: 'insert'; display: boolean } | { mode: 'edit'; pos: number };

/** Quick inserts. "|" marks where the cursor goes. */
export const EQUATION_SNIPPETS: Array<{ label: string; insert: string; title: string }> = [
  { label: 'a⁄b', insert: '\\frac{|}{}', title: 'Fraction' },
  { label: '√x', insert: '\\sqrt{|}', title: 'Square root' },
  { label: 'xⁿ', insert: '^{|}', title: 'Superscript' },
  { label: 'xₙ', insert: '_{|}', title: 'Subscript' },
  { label: 'Σ', insert: '\\sum_{i=1}^{n} |', title: 'Sum' },
  { label: '∫', insert: '\\int_{a}^{b} | \\,dx', title: 'Integral' },
  { label: 'lim', insert: '\\lim_{x \\to |}', title: 'Limit' },
  { label: '( )', insert: '\\left( | \\right)', title: 'Brackets that grow' },
  { label: '[⋯]', insert: '\\begin{pmatrix} | & \\\\ & \\end{pmatrix}', title: 'Matrix' },
  { label: 'α', insert: '\\alpha', title: 'alpha' },
  { label: 'β', insert: '\\beta', title: 'beta' },
  { label: 'θ', insert: '\\theta', title: 'theta' },
  { label: 'π', insert: '\\pi', title: 'pi' },
  { label: 'Δ', insert: '\\Delta', title: 'Delta' },
  { label: '±', insert: '\\pm', title: 'plus or minus' },
  { label: '×', insert: '\\times', title: 'times' },
  { label: '÷', insert: '\\div', title: 'divided by' },
  { label: '≤', insert: '\\le', title: 'less than or equal to' },
  { label: '≥', insert: '\\ge', title: 'greater than or equal to' },
  { label: '≠', insert: '\\neq', title: 'not equal to' },
  { label: '≈', insert: '\\approx', title: 'approximately' },
  { label: '∞', insert: '\\infty', title: 'infinity' },
  { label: '→', insert: '\\to', title: 'arrow' },
  { label: '°', insert: '^{\\circ}', title: 'degrees' },
];

/** A KaTeX error as a short sentence ("KaTeX parse error: " left out). */
const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err)).replace(/^KaTeX parse error:\s*/, '');

/**
 * Writes or edits an equation in LaTeX with a live preview (drawn by KaTeX, as in the document), quick-insert
 * buttons, and a note on how it goes to Word: as an editable equation, or as a picture when Word's equation
 * converter does not know some of the LaTeX.
 */
export function EquationDialog({ editor, target, onClose }: { editor: Editor; target: EquationTarget; onClose: () => void }) {
  const [initial] = useState(() => {
    if (target.mode === 'insert') return { latex: '', display: target.display };
    const node = editor.state.doc.nodeAt(target.pos);
    return isEquation(node) ? { latex: String(node.attrs.latex ?? ''), display: node.type.name === 'blockMath' } : { latex: '', display: false };
  });
  const [latex, setLatex] = useState(initial.latex);
  const [display, setDisplay] = useState(initial.display);
  const [error, setError] = useState<string | null>(null);
  const preview = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const value = latex.trim();

  useEffect(() => {
    const el = preview.current;
    if (!el) return;
    if (!value) {
      el.textContent = '';
      setError(null);
      return;
    }
    try {
      katex.render(value, el, { ...KATEX_OPTIONS, displayMode: display });
      setError(null);
    } catch (err) {
      el.textContent = '';
      setError(errorText(err));
    }
  }, [value, display]);

  const inWord = useMemo(() => (value && !error ? (wordEquation(value) ? 'native' : 'picture') : null), [value, error]);

  const insertSnippet = (snippet: string) => {
    const el = input.current;
    const start = el?.selectionStart ?? latex.length;
    const end = el?.selectionEnd ?? latex.length;
    const cursor = snippet.indexOf('|');
    const text = snippet.replace('|', '');
    setLatex(latex.slice(0, start) + text + latex.slice(end));
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const at = start + (cursor >= 0 ? cursor : text.length);
      el.setSelectionRange(at, at);
    });
  };

  const canApply = !!value && !error;
  const apply = () => {
    if (!canApply) return;
    writeEquation(editor, value, display, target.mode === 'edit' ? target.pos : undefined);
    onClose();
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={target.mode === 'edit' ? 'Edit equation' : 'Insert equation'}
      description="Type the equation in LaTeX, e.g. x = \frac{-b \pm \sqrt{b^2-4ac}}{2a}"
      size="lg"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!canApply} onClick={apply}>
            {target.mode === 'edit' ? 'Apply' : 'Insert'}
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <div role="radiogroup" aria-label="Equation layout" className="flex w-fit rounded-lg border border-border bg-surface-2 p-0.5 text-xs font-medium">
          {[
            { id: false, label: 'Inline (in the line of text)' },
            { id: true, label: 'Display (own line, centred)' },
          ].map((o) => (
            <button
              key={String(o.id)}
              type="button"
              role="radio"
              aria-checked={display === o.id}
              onClick={() => setDisplay(o.id)}
              className={cn('rounded-md px-2.5 py-1', display === o.id ? 'bg-surface text-fg shadow-xs' : 'text-muted hover:text-fg')}
            >
              {o.label}
            </button>
          ))}
        </div>
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium">LaTeX</span>
          <textarea
            ref={input}
            autoFocus
            value={latex}
            spellCheck={false}
            onChange={(e) => setLatex(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                apply();
              }
            }}
            rows={3}
            aria-invalid={!!error}
            aria-describedby="dcos-equation-status"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 font-mono text-sm text-fg focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
        </label>
        <div role="group" aria-label="Insert symbol or structure" className="flex flex-wrap gap-1">
          {EQUATION_SNIPPETS.map((s) => (
            <button
              key={s.title}
              type="button"
              title={s.title}
              aria-label={s.title}
              onClick={() => insertSnippet(s.insert)}
              className="h-7 min-w-7 rounded-md border border-border bg-surface px-1.5 text-[13px] text-fg hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent"
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="grid gap-1.5">
          <span className="text-sm font-medium">Preview</span>
          <div className="flex min-h-16 items-center justify-center overflow-x-auto rounded-lg border border-border bg-white px-3 py-2 text-[#1a1a1f]">
            <div ref={preview} data-testid="equation-preview" aria-label={value ? `Equation: ${value}` : 'Empty equation'} role="img" />
            {!value && <span className="text-sm text-muted">The equation appears here as you type.</span>}
          </div>
        </div>
        <p id="dcos-equation-status" role={error ? 'alert' : 'status'} className={cn('text-xs', error ? 'text-danger' : 'text-muted')}>
          {error
            ? `This LaTeX has a problem: ${error}`
            : inWord === 'native'
              ? equationHasColour(value)
                ? 'Word export: an editable Word equation, without its colours.'
                : 'Word export: an editable Word equation.'
              : inWord === 'picture'
                ? 'Word export: a picture of the equation (Word’s equation converter does not know some of this LaTeX). Your LaTeX is kept as its alternative text.'
                : 'Ctrl/⌘+Enter inserts.'}
        </p>
      </div>
    </Dialog>
  );
}
