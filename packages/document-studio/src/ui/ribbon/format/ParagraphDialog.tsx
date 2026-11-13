import { Button, Dialog, Input, Select } from '@dcos/ui';
import type { Editor } from '@tiptap/core';
import { useState } from 'react';
import {
  currentBlock,
  formatOf,
  isListParagraph,
  INDENT_LIMIT_PT,
  type IndentPatch,
  LINE_SPACING_LIMITS,
  LINE_SPACING_PRESETS,
  SPACING_LIMITS_PT,
  selectedBlocks,
} from '../../../extensions/paragraphFormat';
import { cmToPt, ptToCm, readNumber } from './units';

type Special = 'none' | 'firstLine' | 'hanging';

/**
 * Word's Paragraph dialog: indentation (left, right, first line or hanging), spacing before and after, and line
 * spacing, for every selected paragraph and heading. The keyboard alternative to dragging the ruler's markers.
 */
export function ParagraphDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  // Select all (an AllSelection) has no cursor block: start from the first selected paragraph instead.
  const block = currentBlock(editor.state) ?? selectedBlocks(editor.state)[0] ?? null;
  const inList = !!block && isListParagraph(editor.state, block.pos);
  const f = formatOf(block?.node.attrs);
  const align = (['left', 'center', 'right', 'justify'] as const).find((a) => block?.node.attrs.textAlign === a) ?? 'left';
  const [initial] = useState(() => ({
    align: align as string,
    left: f.indentLeft ? String(ptToCm(f.indentLeft)) : '0',
    right: f.indentRight ? String(ptToCm(f.indentRight)) : '0',
    special: (f.indentFirstLine === null ? 'none' : f.indentFirstLine > 0 ? 'firstLine' : 'hanging') as Special,
    by: f.indentFirstLine ? String(ptToCm(Math.abs(f.indentFirstLine))) : '1.27',
    before: f.spaceBefore === null ? '' : String(f.spaceBefore),
    after: f.spaceAfter === null ? '' : String(f.spaceAfter),
    line: f.lineSpacing === null ? 'default' : (LINE_SPACING_PRESETS as readonly number[]).includes(f.lineSpacing) ? String(f.lineSpacing) : 'multiple',
    at: f.lineSpacing === null ? '1.15' : String(f.lineSpacing),
  }));
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<typeof draft>) => setDraft((d) => ({ ...d, ...patch }));

  const apply = () => {
    const left = readNumber(draft.left) ?? 0;
    const right = readNumber(draft.right) ?? 0;
    const by = readNumber(draft.by) ?? 0;
    const before = readNumber(draft.before);
    const after = readNumber(draft.after);
    const at = readNumber(draft.at);
    const maxCm = ptToCm(INDENT_LIMIT_PT);
    if (left < 0 || right < 0 || by < 0 || left > maxCm || right > maxCm || by > maxCm) return setError(`Indents must be between 0 and ${maxCm} cm.`);
    if ((before !== null && (before < SPACING_LIMITS_PT.min || before > SPACING_LIMITS_PT.max)) || (after !== null && (after < SPACING_LIMITS_PT.min || after > SPACING_LIMITS_PT.max)))
      return setError(`Spacing must be between ${SPACING_LIMITS_PT.min} and ${SPACING_LIMITS_PT.max} pt.`);
    const multiple = draft.line === 'default' ? null : draft.line === 'multiple' ? at : Number(draft.line);
    if (draft.line === 'multiple' && (multiple === null || multiple < LINE_SPACING_LIMITS.min || multiple > LINE_SPACING_LIMITS.max))
      return setError(`Line spacing must be between ${LINE_SPACING_LIMITS.min} and ${LINE_SPACING_LIMITS.max}.`);
    if (draft.special === 'hanging' && by > left) return setError('A hanging indent cannot be larger than the left indent.');
    const firstLine = draft.special === 'none' ? null : draft.special === 'firstLine' ? cmToPt(by) : -cmToPt(by);
    // Only the fields the user changed are applied. The fields start from the first selected paragraph, so applying
    // the others too would copy its indents and spacing onto every selected paragraph (alignment works the same way).
    const changed = (k: keyof typeof draft) => draft[k] !== initial[k];
    const indent: IndentPatch = {};
    if (changed('left')) indent.indentLeft = left ? cmToPt(left) : null;
    if (changed('right')) indent.indentRight = right ? cmToPt(right) : null;
    if (changed('special') || (draft.special !== 'none' && changed('by'))) indent.indentFirstLine = firstLine || null;
    const spacing: { before?: number | null; after?: number | null } = {};
    if (changed('before')) spacing.before = before;
    if (changed('after')) spacing.after = after;
    const lineChanged = changed('line') || (draft.line === 'multiple' && changed('at'));
    editor
      .chain()
      .focus()
      .command(({ commands }) => (draft.align === align ? true : commands.setTextAlign(draft.align)))
      .command(({ commands }) => (Object.keys(indent).length ? commands.setParagraphIndent(indent) || true : true))
      .command(({ commands }) => (Object.keys(spacing).length ? commands.setParagraphSpacing(spacing) || true : true))
      .command(({ commands }) => (lineChanged ? commands.setLineSpacing(multiple) || true : true))
      .run();
    onClose();
  };

  const field = 'grid gap-1 text-xs text-muted';
  return (
    <Dialog
      open
      onClose={onClose}
      title="Paragraph"
      description={block ? 'Applies to the selected paragraphs and headings. Settings you leave unchanged keep each paragraph\'s own value.' : 'Place the cursor in a paragraph or heading first.'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!block} onClick={apply}>
            Apply
          </Button>
        </>
      }
    >
      <form
        className="grid gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          apply();
        }}
      >
        <label className={field}>
          Alignment
          <Select value={draft.align} onChange={(e) => set({ align: e.target.value })} className="h-9">
            <option value="left">Left</option>
            <option value="center">Centred</option>
            <option value="right">Right</option>
            <option value="justify">Justified</option>
          </Select>
        </label>
        <fieldset className="grid gap-2">
          <legend className="mb-1.5 text-sm font-medium">Indentation</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <label className={field}>
              Left (cm)
              <Input type="number" min={0} step={0.05} value={draft.left} onChange={(e) => set({ left: e.target.value })} />
            </label>
            <label className={field}>
              Right (cm)
              <Input type="number" min={0} step={0.05} value={draft.right} onChange={(e) => set({ right: e.target.value })} />
            </label>
            <label className={field}>
              Special
              <Select value={draft.special} disabled={inList} title={inList ? 'List items hang from their bullet or number' : undefined} onChange={(e) => set({ special: e.target.value as Special })} className="h-9">
                <option value="none">(none)</option>
                <option value="firstLine">First line</option>
                <option value="hanging">Hanging</option>
              </Select>
            </label>
            <label className={field}>
              By (cm)
              <Input type="number" min={0} step={0.05} value={draft.by} disabled={draft.special === 'none'} onChange={(e) => set({ by: e.target.value })} />
            </label>
          </div>
        </fieldset>
        <fieldset className="grid gap-2">
          <legend className="mb-1.5 text-sm font-medium">Spacing</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <label className={field}>
              Before (pt)
              <Input type="number" min={0} max={SPACING_LIMITS_PT.max} step={1} placeholder="Auto" value={draft.before} onChange={(e) => set({ before: e.target.value })} />
            </label>
            <label className={field}>
              After (pt)
              <Input type="number" min={0} max={SPACING_LIMITS_PT.max} step={1} placeholder="Auto" value={draft.after} onChange={(e) => set({ after: e.target.value })} />
            </label>
            <label className={field}>
              Line spacing
              <Select value={draft.line} onChange={(e) => set({ line: e.target.value })} className="h-9">
                <option value="default">Default</option>
                <option value="1">Single (1.0)</option>
                <option value="1.15">1.15</option>
                <option value="1.5">1.5 lines</option>
                <option value="2">Double (2.0)</option>
                <option value="multiple">Multiple</option>
              </Select>
            </label>
            <label className={field}>
              At (lines)
              <Input
                type="number"
                min={LINE_SPACING_LIMITS.min}
                max={LINE_SPACING_LIMITS.max}
                step={0.05}
                value={draft.at}
                disabled={draft.line !== 'multiple'}
                onChange={(e) => set({ at: e.target.value })}
              />
            </label>
          </div>
          <p className="text-xs text-muted">Leave Before or After empty to use the style's own spacing.</p>
        </fieldset>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
