// @vitest-environment jsdom
import { ToastProvider } from '@dcos/ui';
import type { JSONContent } from '@tiptap/core';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DocumentEditor } from '../DocumentEditor';
import { createEmptyDocument, type DocumentContent } from '../types';
import type { CommentThread } from './comments';

const withProviders = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);
const T0 = '2026-03-01T10:00:00.000Z';
const docWith = (content: JSONContent[], extra: Partial<DocumentContent> = {}) => ({ ...createEmptyDocument(), mode: 'advanced' as const, doc: { type: 'doc', content }, ...extra });
const para = (...content: JSONContent[]) => ({ type: 'paragraph', content });
const lastSaved = (onChange: ReturnType<typeof vi.fn>) => onChange.mock.calls.at(-1)?.[0] as DocumentContent;
const thread = (id: string, over: Partial<CommentThread> = {}): CommentThread => ({ id, author: 'Ada', createdAt: T0, text: `Note ${id}`, resolved: false, replies: [], ...over });

/** Selects `text` inside the document body (the first text node containing it), as a user drag would. */
async function selectText(text: string) {
  const body = await screen.findByRole('textbox', { name: 'Document body' });
  body.focus();
  const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const i = node.textContent!.indexOf(text);
    if (i < 0) continue;
    const range = document.createRange();
    range.setStart(node, i);
    range.setEnd(node, i + text.length);
    document.getSelection()?.removeAllRanges();
    document.getSelection()?.addRange(range);
    await act(async () => document.dispatchEvent(new Event('selectionchange')));
    return;
  }
  throw new Error(`text not found: ${text}`);
}
const reviewTab = async () => {
  fireEvent.click(await screen.findByRole('tab', { name: 'Review' }));
  return within(screen.getByRole('toolbar', { name: 'Review' }));
};
const panel = () => within(screen.getByRole('complementary', { name: 'Comments' }));

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:x');
  URL.revokeObjectURL = vi.fn();
  document.elementFromPoint ??= () => null;
  HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
  Element.prototype.scrollIntoView ??= () => undefined;
});

describe('comments in the editor', () => {
  it('adds a comment on the selected text under the name from Settings, and saves the thread with the document', async () => {
    const onChange = vi.fn();
    withProviders(<DocumentEditor initialContent={docWith([para({ type: 'text', text: 'The mitochondria is the powerhouse.' })])} title="T" onChange={onChange} authorName="Asha Rao" />);
    const tab = await reviewTab();
    expect((tab.getByRole('button', { name: 'New comment' }) as HTMLButtonElement).disabled).toBe(true);
    await selectText('powerhouse');
    fireEvent.click(tab.getByRole('button', { name: 'New comment' }));
    const box = panel().getByRole('textbox', { name: 'New comment' });
    fireEvent.change(box, { target: { value: 'Cite a source here.' } });
    fireEvent.click(panel().getByRole('button', { name: 'Comment' }));

    await waitFor(() => expect(lastSaved(onChange).comments).toHaveLength(1));
    const saved = lastSaved(onChange);
    const [t] = saved.comments!;
    expect(t).toMatchObject({ author: 'Asha Rao', text: 'Cite a source here.', resolved: false, replies: [] });
    expect(Number.isNaN(Date.parse(t.createdAt))).toBe(false);
    expect(JSON.stringify(saved.doc)).toContain(`{"type":"comment","attrs":{"commentId":"${t.id}"}}`);
    expect(saved.schemaVersion).toBe(2);
    // Shown in the panel with the commented text, and highlighted in the document.
    const card = panel().getByRole('article', { name: 'Comment by Asha Rao' });
    expect(card.textContent).toContain('On “powerhouse”');
    expect(card.textContent).toContain('Cite a source here.');
    expect(document.querySelector(`style`)?.parentElement).toBeTruthy();
    expect([...document.querySelectorAll('style')].some((s) => s.textContent!.includes(`span[data-comment-id="${t.id}"]`))).toBe(true);
  });

  it('replies, edits, resolves, reopens and deletes; every change is saved', async () => {
    const onChange = vi.fn();
    const content = docWith([para({ type: 'text', text: 'Alpha ' }, { type: 'text', text: 'beta', marks: [{ type: 'comment', attrs: { commentId: 'c1' } }] })], { comments: [thread('c1')], schemaVersion: 2 });
    withProviders(<DocumentEditor initialContent={content} title="T" onChange={onChange} authorName="Bo" />);
    const tab = await reviewTab();
    fireEvent.click(tab.getByRole('button', { name: 'Show comments' }));
    expect(onChange).not.toHaveBeenCalled(); // opening and showing comments saves nothing

    fireEvent.click(panel().getByRole('button', { name: 'Reply to comment by Ada' }));
    fireEvent.change(panel().getByRole('textbox', { name: 'Reply' }), { target: { value: 'Fixed it' } });
    fireEvent.keyDown(panel().getByRole('textbox', { name: 'Reply' }), { key: 'Enter', ctrlKey: true });
    await waitFor(() => expect(lastSaved(onChange).comments![0].replies).toMatchObject([{ author: 'Bo', text: 'Fixed it' }]));

    fireEvent.click(panel().getByRole('button', { name: 'Edit comment by Ada' }));
    fireEvent.change(panel().getByRole('textbox', { name: 'Edit comment' }), { target: { value: 'Note c1, revised' } });
    fireEvent.click(panel().getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(lastSaved(onChange).comments![0]).toMatchObject({ text: 'Note c1, revised', editedAt: expect.any(String) }));
    expect(panel().getByText(/edited/)).toBeTruthy();

    fireEvent.click(panel().getByRole('button', { name: 'Resolve comment by Ada' }));
    await waitFor(() => expect(lastSaved(onChange).comments![0].resolved).toBe(true));
    // Resolved threads are tucked away and no longer highlighted.
    expect(panel().getByRole('button', { name: 'Show resolved (1)' })).toBeTruthy();
    expect([...document.querySelectorAll('style')].some((s) => s.textContent!.includes('data-comment-id="c1"'))).toBe(false);
    fireEvent.click(panel().getByRole('button', { name: 'Show resolved (1)' }));
    fireEvent.click(panel().getByRole('button', { name: 'Reopen comment by Ada' }));
    await waitFor(() => expect(lastSaved(onChange).comments![0].resolved).toBe(false));

    fireEvent.click(panel().getByRole('button', { name: 'Delete reply by Bo' }));
    fireEvent.click(panel().getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(lastSaved(onChange).comments![0].replies).toEqual([]));

    fireEvent.click(panel().getByRole('button', { name: 'Delete comment by Ada' }));
    fireEvent.click(panel().getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(lastSaved(onChange).comments).toBeUndefined());
    const saved = lastSaved(onChange);
    expect('comments' in saved).toBe(false);
    expect(JSON.stringify(saved.doc)).not.toContain('comment');
    // Nothing new left: the document is readable by v0.1.0 again.
    expect(saved.schemaVersion).toBe(1);
  });

  it('moves between comments in text order and lists comments on deleted text separately', async () => {
    const mark = (id: string) => [{ type: 'comment', attrs: { commentId: id } }];
    const content = docWith(
      [para({ type: 'text', text: 'first', marks: mark('b') }, { type: 'text', text: ' and ' }, { type: 'text', text: 'second', marks: mark('a') })],
      { comments: [thread('a'), thread('b'), thread('gone')], schemaVersion: 2 },
    );
    withProviders(<DocumentEditor initialContent={content} title="T" onChange={vi.fn()} />);
    const tab = await reviewTab();
    fireEvent.click(tab.getByRole('button', { name: 'Next comment' }));
    const cards = panel().getAllByRole('article');
    expect(cards.map((c) => c.getAttribute('data-comment-thread'))).toEqual(['b', 'a', 'gone']);
    expect(cards[0].getAttribute('aria-current')).toBe('true');
    fireEvent.click(tab.getByRole('button', { name: 'Next comment' }));
    expect(panel().getAllByRole('article')[1].getAttribute('aria-current')).toBe('true');
    fireEvent.click(tab.getByRole('button', { name: 'Next comment' }));
    expect(panel().getAllByRole('article')[0].getAttribute('aria-current')).toBe('true'); // wraps around
    const deleted = within(panel().getByRole('region', { name: 'Comments on deleted text' }));
    expect(deleted.getByRole('heading').textContent).toBe('On deleted text (1)');
    expect(deleted.getByRole('article', { name: 'Comment by Ada' }).textContent).toContain('Note gone');
    // With no name set, new comments are labelled and the panel says where to set one.
    expect(panel().getByText(/Add your name in Settings/)).toBeTruthy();
  });

  it('says why a comment cannot be added (button hint, and a notice when the shortcut is used)', async () => {
    withProviders(<DocumentEditor initialContent={docWith([para({ type: 'text', text: 'Some text here' })])} title="T" onChange={vi.fn()} />);
    const tab = await reviewTab();
    const button = tab.getByRole('button', { name: 'New comment' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.title).toBe('New comment: Select some text to comment on.');
    // Ctrl/Cmd+Alt+M with nothing selected: nothing is started, and the panel says why.
    await act(async () => window.dispatchEvent(new Event('dcos:new-comment')));
    expect(panel().getByRole('status').textContent).toBe('Select some text to comment on.');
    expect(panel().queryByRole('textbox', { name: 'New comment' })).toBeNull();
    // Selecting text makes the button available and clears the notice.
    await selectText('text');
    expect(button.disabled).toBe(false);
    expect(button.title).toBe('New comment on the selected text (Ctrl+Alt+M)');
    expect(panel().queryByRole('status')).toBeNull();
  });

  it('closing the panel abandons a comment being written, without saving anything', async () => {
    const onChange = vi.fn();
    withProviders(<DocumentEditor initialContent={docWith([para({ type: 'text', text: 'Some text here' })])} title="T" onChange={onChange} />);
    const tab = await reviewTab();
    await selectText('text');
    fireEvent.click(tab.getByRole('button', { name: 'New comment' }));
    expect(document.querySelector('.dcos-comment-pending')?.textContent).toBe('text');
    fireEvent.click(panel().getByRole('button', { name: 'Close comments' }));
    expect(screen.queryByRole('complementary', { name: 'Comments' })).toBeNull();
    expect(document.querySelector('.dcos-comment-pending')).toBeNull();
    expect(onChange.mock.calls.every(([c]) => !(c as DocumentContent).comments && !JSON.stringify((c as DocumentContent).doc).includes('comment'))).toBe(true);
  });

  it('clicking commented text shows its thread, in Simple mode too', async () => {
    const content = { ...docWith([para({ type: 'text', text: 'see ' }, { type: 'text', text: 'this', marks: [{ type: 'comment', attrs: { commentId: 'c1' } }] })], { comments: [thread('c1')], schemaVersion: 2 }), mode: 'simple' as const };
    withProviders(<DocumentEditor initialContent={content} title="T" onChange={vi.fn()} />);
    await screen.findByRole('tab', { name: 'Home' });
    expect(screen.queryByRole('tab', { name: 'Review' })).toBeNull();
    const span = document.querySelector('span[data-comment-id="c1"]')!;
    // ProseMirror maps the click to a document position through the layout, which jsdom lacks: dispatch the event
    // the click handler sends.
    expect(span.textContent).toBe('this');
    await act(async () => window.dispatchEvent(new Event('dcos:show-comments')));
    expect(panel().getByRole('article', { name: 'Comment by Ada' })).toBeTruthy();
  });

  it('opens content with invalid comment threads in the protected view, without saving', async () => {
    const onChange = vi.fn();
    withProviders(<DocumentEditor initialContent={docWith([para({ type: 'text', text: 'x' })], { comments: [{ id: 'c1' }] as never, schemaVersion: 2 })} title="T" onChange={onChange} />);
    expect(await screen.findByText(/Opened read-only/)).toBeTruthy();
    expect(screen.getByText(/comment is not valid|invalid/)).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('proofing', () => {
  it('sets the document language on the text and saves it', async () => {
    const onChange = vi.fn();
    withProviders(<DocumentEditor initialContent={docWith([para({ type: 'text', text: 'Colour' })])} title="T" onChange={onChange} />);
    const tab = await reviewTab();
    const body = screen.getByRole('textbox', { name: 'Document body' });
    expect(body.hasAttribute('lang')).toBe(false);
    fireEvent.change(tab.getByRole('combobox', { name: 'Document language' }), { target: { value: 'en-GB' } });
    await waitFor(() => expect(lastSaved(onChange).language).toBe('en-GB'));
    expect(body.getAttribute('lang')).toBe('en-GB');
    expect(lastSaved(onChange).schemaVersion).toBe(2);
    fireEvent.change(tab.getByRole('combobox', { name: 'Document language' }), { target: { value: '' } });
    await waitFor(() => expect('language' in lastSaved(onChange)).toBe(false));
    expect(body.hasAttribute('lang')).toBe(false);
  });

  it('starts spell check from the remembered setting and reports the toggle so the app can remember it', async () => {
    const onSpellcheckChange = vi.fn();
    withProviders(<DocumentEditor initialContent={docWith([para({ type: 'text', text: 'x' })])} title="T" onChange={vi.fn()} spellcheck={false} onSpellcheckChange={onSpellcheckChange} />);
    const tab = await reviewTab();
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Document body' }).getAttribute('spellcheck')).toBe('false'));
    fireEvent.click(tab.getByRole('button', { name: 'Spell check off' }));
    expect(onSpellcheckChange).toHaveBeenCalledWith(true);
    expect(screen.getByRole('textbox', { name: 'Document body' }).getAttribute('spellcheck')).toBe('true');
  });

  it('word count dialog shows the document and the selection, with paragraphs', async () => {
    withProviders(<DocumentEditor initialContent={docWith([para({ type: 'text', text: 'One two three' }), para({ type: 'text', text: 'Four five' })])} title="T" onChange={vi.fn()} />);
    const tab = await reviewTab();
    await selectText('two three');
    fireEvent.click(tab.getByRole('button', { name: 'Word count' }));
    const list = screen.getByLabelText('Word count', { selector: 'dl' });
    expect(within(list).getByLabelText('Words in the document').textContent).toBe('5');
    expect(within(list).getByLabelText('Words in the selection').textContent).toBe('2');
    expect(within(list).getByLabelText('Characters in the selection').textContent).toBe('9');
    expect(within(list).getByLabelText('Characters (no spaces) in the selection').textContent).toBe('8');
    expect(within(list).getByLabelText('Paragraphs in the document').textContent).toBe('2');
    expect(within(list).getByLabelText('Paragraphs in the selection').textContent).toBe('1');
  });

  it('find has Match case and Whole words options', async () => {
    withProviders(<DocumentEditor initialContent={docWith([para({ type: 'text', text: 'cat catalog Cat' })])} title="T" onChange={vi.fn()} />);
    const tab = await reviewTab();
    fireEvent.click(tab.getByRole('button', { name: 'Find and replace (Ctrl+F)' }));
    const bar = within(screen.getByRole('search'));
    fireEvent.change(bar.getByRole('textbox', { name: 'Find' }), { target: { value: 'cat' } });
    await waitFor(() => expect(bar.getByText('1/3')).toBeTruthy());
    fireEvent.click(bar.getByRole('checkbox', { name: 'Whole words' }));
    await waitFor(() => expect(bar.getByText('1/2')).toBeTruthy());
    fireEvent.click(bar.getByRole('checkbox', { name: 'Match case' }));
    await waitFor(() => expect(bar.getByText('1/1')).toBeTruthy());
  });
});
