import { expect, test, type Page } from '@playwright/test';
import JSZip from 'jszip';
import { createFromQuickStart, downloadBytes, readStore, waitSaved } from './helpers';

/** Phase 4, group G-REVIEW: comments, the author name, spell check and language, find options and word count. */

type StoredDoc = { id: string; content: { schemaVersion: number; doc: unknown; comments?: Array<{ id: string; author: string; text: string; resolved: boolean; replies: Array<{ author: string; text: string }> }>; language?: string } };
const stored = async (page: Page, id: string) => (await readStore<StoredDoc>(page, 'documents')).find((d) => d.id === id)!.content;

async function setName(page: Page, name: string) {
  await page.goto('./#/settings/general');
  await page.getByRole('textbox', { name: 'Your name' }).fill(name);
}

async function openReview(page: Page) {
  await page.getByRole('radio', { name: 'advanced' }).click();
  const tab = page.getByRole('tab', { name: 'Review' });
  await tab.click();
  return page.getByRole('toolbar', { name: 'Review' });
}

/** Selects a word in the document as a user would (double-click). */
async function selectWord(page: Page, paragraph: string, word: string) {
  const el = page.locator('.ProseMirror').getByText(paragraph, { exact: false }).first();
  await el.evaluate((node, w) => {
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    let t: Node | null;
    while ((t = walker.nextNode())) {
      const i = t.textContent!.indexOf(w);
      if (i < 0) continue;
      const range = document.createRange();
      range.setStart(t, i);
      range.setEnd(t, i + w.length);
      (node.closest('.ProseMirror') as HTMLElement).focus();
      getSelection()!.removeAllRanges();
      getSelection()!.addRange(range);
      return;
    }
    throw new Error('word not found');
  }, word);
}

test('a comment is written under the name from Settings, saved, kept after reload, replied to, resolved and exported to Word', async ({ page }) => {
  await setName(page, 'Asha Rao');
  const id = await createFromQuickStart(page, 'Assignment');
  const review = await openReview(page);
  await selectWord(page, 'Begin your answer here.', 'answer');
  await review.getByRole('button', { name: 'New comment' }).click();
  const panel = page.getByRole('complementary', { name: 'Comments' });
  await panel.getByRole('textbox', { name: 'New comment' }).fill('Explain this in more detail.');
  await panel.getByRole('button', { name: 'Comment', exact: true }).click();

  const card = panel.getByRole('article', { name: 'Comment by Asha Rao' });
  await expect(card).toContainText('On “answer”');
  await expect(card).toContainText('Explain this in more detail.');
  // The commented text is highlighted in the page.
  const marked = page.locator('.ProseMirror span[data-comment-id]');
  await expect(marked).toHaveText('answer');
  expect(await marked.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');

  await waitSaved(page);
  await expect.poll(async () => (await stored(page, id)).comments?.length).toBe(1);
  const content = await stored(page, id);
  expect(content.schemaVersion).toBe(2);
  expect(content.comments![0]).toMatchObject({ author: 'Asha Rao', text: 'Explain this in more detail.', resolved: false });

  // Kept after reload; clicking the commented text shows the thread.
  await page.reload();
  await page.locator('.ProseMirror span[data-comment-id]').click();
  await expect(page.getByRole('article', { name: 'Comment by Asha Rao' })).toBeVisible();
  const panel2 = page.getByRole('complementary', { name: 'Comments' });
  await panel2.getByRole('button', { name: 'Reply to comment by Asha Rao' }).click();
  await panel2.getByRole('textbox', { name: 'Reply' }).fill('Done, added two examples.');
  await panel2.getByRole('textbox', { name: 'Reply' }).press('ControlOrMeta+Enter');
  await expect(panel2).toContainText('Done, added two examples.');
  await panel2.getByRole('button', { name: 'Resolve comment by Asha Rao' }).click();
  // The thread stays in view while it is the current one, now under the resolved group.
  await expect(panel2.getByRole('button', { name: /resolved \(1\)/ })).toBeVisible();
  await expect(panel2.getByRole('article', { name: 'Comment by Asha Rao' })).toContainText('Resolved');
  await expect.poll(async () => (await stored(page, id)).comments?.[0]?.resolved).toBe(true);
  expect((await stored(page, id)).comments![0].replies).toMatchObject([{ author: 'Asha Rao', text: 'Done, added two examples.' }]);

  // Word export: a real comment with its reply and resolved state.
  await page.getByRole('button', { name: /export/i }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: /Word document/ }).click()]);
  const zip = await JSZip.loadAsync(await downloadBytes(download));
  const comments = await zip.file('word/comments.xml')!.async('string');
  expect(comments).toContain('w:author="Asha Rao"');
  expect(comments).toContain('Explain this in more detail.');
  expect(comments).toContain('Done, added two examples.');
  const extended = await zip.file('word/commentsExtended.xml')!.async('string');
  expect(extended).toContain('w15:paraIdParent="00000001"');
  expect(extended).toContain('w15:done="1"');
  const body = await zip.file('word/document.xml')!.async('string');
  expect(body).toMatch(/<w:commentRangeStart w:id="0"\/>.*answer.*<w:commentRangeEnd w:id="0"\/>/s);
});

test('comments are not printed, and deleting the last comment makes the document readable by v0.1.0 again', async ({ page }) => {
  const id = await createFromQuickStart(page, 'Assignment');
  const review = await openReview(page);
  await expect(review.getByRole('button', { name: 'New comment' })).toBeDisabled();
  await selectWord(page, 'Begin your answer here.', 'Begin');
  // Ctrl/⌘+Alt+M, as in Word, starts a comment on the selection.
  await page.keyboard.press('ControlOrMeta+Alt+KeyM');
  const panel = page.getByRole('complementary', { name: 'Comments' });
  await panel.getByRole('textbox', { name: 'New comment' }).fill('Note');
  await panel.getByRole('textbox', { name: 'New comment' }).press('ControlOrMeta+Enter');
  await expect(panel.getByRole('article')).toHaveCount(1);
  // No name set: the comment says so, and the panel says where to set one.
  await expect(panel.getByRole('article', { name: 'Comment by Unknown author' })).toBeVisible();
  await expect(panel).toContainText('Add your name in Settings');

  // Printing shows no comment highlight (the print rules are part of the document styles the print page uses).
  const printCss = await page.evaluate(() => [...document.querySelectorAll('style')].map((s) => s.textContent).join('\n'));
  expect(printCss).toMatch(/@media print[\s\S]*\.dcos-doc \.dcos-comment, \.dcos-doc \.dcos-comment-pending \{ background: none !important/);

  await panel.getByRole('button', { name: 'Delete comment by Unknown author' }).click();
  await panel.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(panel.getByRole('article')).toHaveCount(0);
  await expect(page.locator('.ProseMirror span[data-comment-id]')).toHaveCount(0);
  await expect.poll(async () => (await stored(page, id)).comments).toBeUndefined();
  expect((await stored(page, id)).schemaVersion).toBe(1);
});

test('spell check is remembered, and the document language is saved and set on the text', async ({ page }) => {
  const id = await createFromQuickStart(page, 'Assignment');
  const review = await openReview(page);
  const body = page.getByRole('textbox', { name: 'Document body' });
  await expect(body).toHaveAttribute('spellcheck', 'true');
  await review.getByRole('button', { name: 'Spell check on' }).click();
  await expect(body).toHaveAttribute('spellcheck', 'false');
  await review.getByRole('combobox', { name: 'Document language' }).selectOption('en-GB');
  await expect(body).toHaveAttribute('lang', 'en-GB');
  await expect.poll(async () => (await stored(page, id)).language).toBe('en-GB');

  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Document body' })).toHaveAttribute('spellcheck', 'false');
  await expect(page.getByRole('textbox', { name: 'Document body' })).toHaveAttribute('lang', 'en-GB');
  // The Settings page shows (and changes) the same remembered setting.
  await page.goto('./#/settings/general');
  await expect(page.getByRole('combobox', { name: 'Spell check in documents' })).toHaveValue('off');
});

test('find has Match case and Whole words; the word count dialog counts the document and the selection', async ({ page }) => {
  await createFromQuickStart(page, 'Assignment');
  const review = await openReview(page);
  await review.getByRole('button', { name: 'Find and replace (Ctrl+F)' }).click();
  const bar = page.getByRole('search');
  await bar.getByRole('textbox', { name: 'Find' }).fill('here');
  const counter = bar.locator('[aria-live="polite"]');
  const all = Number((await counter.textContent())!.split('/')[1]);
  expect(all).toBeGreaterThan(0);
  await bar.getByRole('checkbox', { name: 'Whole words' }).check();
  const whole = Number((await counter.textContent())!.split('/')[1]);
  expect(whole).toBeLessThanOrEqual(all);
  await bar.getByRole('textbox', { name: 'Find' }).fill('Begin your');
  await expect(counter).toHaveText('1/1');
  await bar.getByRole('checkbox', { name: 'Match case' }).check();
  await bar.getByRole('textbox', { name: 'Find' }).fill('begin your');
  await expect(counter).toHaveText('0/0');
  await bar.getByRole('button', { name: 'Close find' }).click();

  await selectWord(page, 'Begin your answer here.', 'Begin your answer');
  await review.getByRole('button', { name: 'Word count' }).click();
  const list = page.getByLabel('Word count', { exact: true });
  await expect(list.getByLabel('Words in the selection')).toHaveText('3');
  await expect(list.getByLabel('Characters in the selection')).toHaveText('17');
  await expect(list.getByLabel('Paragraphs in the selection')).toHaveText('1');
  expect(Number(await list.getByLabel('Paragraphs in the document').textContent())).toBeGreaterThan(3);
});

test('on a phone-width screen the comments panel covers the page and nothing scrolls sideways', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await createFromQuickStart(page, 'Assignment');
  const review = await openReview(page);
  await selectWord(page, 'Begin your answer here.', 'answer');
  const button = review.getByRole('button', { name: 'New comment' });
  await button.scrollIntoViewIfNeeded();
  await button.click();
  const panel = page.getByRole('complementary', { name: 'Comments' });
  await expect(panel.getByRole('textbox', { name: 'New comment' })).toBeVisible();
  const box = (await panel.boundingBox())!;
  expect(box.width).toBeGreaterThan(380);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await panel.getByRole('textbox', { name: 'New comment' }).fill('Mobile note');
  await panel.getByRole('button', { name: 'Comment', exact: true }).click();
  await expect(panel.getByRole('article')).toHaveCount(1);
  await panel.getByRole('button', { name: 'Close comments' }).click();
  await expect(panel).toHaveCount(0);
});
