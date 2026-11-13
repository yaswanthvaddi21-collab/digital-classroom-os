import { IconButton, Separator } from '@dcos/ui';
import { Search, SpellCheck } from 'lucide-react';
import { CommentsGroup, LanguagePicker, WordCountButton } from '../../review/ReviewControls';
import type { RibbonContext } from './context';
import { Group } from './parts';

/** Review: find and replace, spell checking and language, word count, and comments. */
export function ReviewTab(ctx: RibbonContext) {
  const { spellcheck, onToggleFind, onToggleSpellcheck, review } = ctx;
  return (
    <>
      <Group label="Proofing" className="gap-1">
        <IconButton label="Find and replace (Ctrl+F)" onClick={onToggleFind}>
          <Search size={16} />
        </IconButton>
        <IconButton label={spellcheck ? 'Spell check on' : 'Spell check off'} active={spellcheck} onClick={onToggleSpellcheck}>
          <SpellCheck size={16} />
        </IconButton>
        {review && <LanguagePicker review={review} />}
        <WordCountButton editor={ctx.editor} />
        {/* @phase4:review-proofing — further proofing controls go here. */}
      </Group>
      {review && (
        <>
          <Separator vertical />
          <Group label="Comments" className="gap-1">
            <CommentsGroup review={review} />
          </Group>
        </>
      )}
      {/* @phase4:review — further Review tab groups go here. */}
    </>
  );
}
