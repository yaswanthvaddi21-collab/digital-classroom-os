// @vitest-environment jsdom
import { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { inlineRemoteImage } from '../image';
import { documentExtensions } from './index';
import { countRemoteImages, isRemoteImageSrc } from './remoteImages';

// jsdom has no ClipboardEvent; ProseMirror's pasteHTML only needs the event to exist.
globalThis.ClipboardEvent ??= class ClipboardEvent extends Event {
  clipboardData = null;
} as unknown as typeof globalThis.ClipboardEvent;

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});

const DATA = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const images = (e: Editor) => {
  const out: string[] = [];
  e.state.doc.descendants((n) => void (n.type.name === 'image' && out.push(n.attrs.src)));
  return out;
};
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('images pasted from the web (audit DS-3)', () => {
  it('stores a pasted web image in the document when it can be fetched', async () => {
    const inline = vi.fn(async () => DATA);
    editor = new Editor({ element: document.createElement('div'), extensions: documentExtensions({ inlineRemoteImage: inline }), content: '<p>Before</p>' });
    editor.view.pasteHTML('<img src="https://example.com/cat.png" alt="cat">');
    await flush();
    expect(inline).toHaveBeenCalledWith('https://example.com/cat.png');
    expect(images(editor)).toEqual([DATA]);
    // One undo removes the paste; the inlining is part of it.
    editor.commands.undo();
    expect(images(editor)).toEqual([]);
  });

  it('keeps the image, visibly marked, when it cannot be fetched', async () => {
    const inline = vi.fn(async () => null);
    editor = new Editor({ element: document.createElement('div'), extensions: documentExtensions({ inlineRemoteImage: inline }), content: '<p>Before</p>' });
    editor.view.pasteHTML('<img src="https://example.com/cat.png" alt="cat">');
    await flush();
    expect(images(editor)).toEqual(['https://example.com/cat.png']);
    const marked = editor.view.dom.querySelector('.dcos-image-remote');
    expect(marked).not.toBeNull();
    expect(marked!.getAttribute('data-offline-label')).toBe('Not saved for offline use');
    expect(countRemoteImages(editor.getJSON())).toBe(1);
  });

  it('never fetches or changes images already in a document when it opens', async () => {
    const inline = vi.fn(async () => DATA);
    editor = new Editor({
      element: document.createElement('div'),
      extensions: documentExtensions({ inlineRemoteImage: inline }),
      content: { type: 'doc', content: [{ type: 'image', attrs: { src: 'https://example.com/old.png' } }, { type: 'paragraph' }] },
    });
    editor.chain().focus('end').insertContent('typing').run();
    await flush();
    expect(inline).not.toHaveBeenCalled();
    expect(images(editor)).toEqual(['https://example.com/old.png']);
    expect(editor.view.dom.querySelector('.dcos-image-remote')).not.toBeNull();
  });

  // Other plugins append transactions to a paste (a trailing paragraph, autolinked text); the pasted images must
  // still be fetched (verifier probe: these were left remote).
  for (const [name, content, html, where] of [
    ['at the end of the document', '<p>Before</p>', '<img src="https://example.com/b.png">', 'end'],
    ['into an empty document', '<p></p>', '<img src="https://example.com/c.png">', 'end'],
    ['together with a web address that is autolinked', '<p>Before</p>', '<p>see https://example.org now</p><img src="https://example.com/d.png"><p>after</p>', 'start'],
    ['into a table cell', '<table><tr><td><p>x</p></td></tr></table><p>z</p>', '<img src="https://example.com/e.png">', 'cell'],
  ] as const) {
    it(`stores a web image pasted ${name}`, async () => {
      const inline = vi.fn(async () => DATA);
      editor = new Editor({ element: document.createElement('div'), extensions: documentExtensions({ inlineRemoteImage: inline }), content });
      if (where === 'cell') editor.commands.setTextSelection(4);
      else editor.commands.focus(where);
      editor.view.pasteHTML(html);
      await flush();
      expect(inline).toHaveBeenCalledTimes(1);
      expect(images(editor)).toEqual([DATA]);
    });
  }

  it('does not fetch again when later edits follow a paste', async () => {
    const inline = vi.fn(async () => null);
    editor = new Editor({ element: document.createElement('div'), extensions: documentExtensions({ inlineRemoteImage: inline }), content: '<p>Before</p>' });
    editor.view.pasteHTML('<img src="https://example.com/cat.png">');
    await flush();
    editor.chain().focus('end').insertContent('more').run();
    editor.chain().focus('start').insertContent('<img src="https://example.com/typed.png">').run();
    await flush();
    expect(inline.mock.calls).toEqual([['https://example.com/cat.png']]);
  });

  it('recognises remote addresses', () => {
    expect(isRemoteImageSrc('https://a.b/c.png')).toBe(true);
    expect(isRemoteImageSrc('//a.b/c.png')).toBe(true);
    expect(isRemoteImageSrc(DATA)).toBe(false);
    expect(isRemoteImageSrc('blob:x')).toBe(false);
  });
});

describe('inlineRemoteImage', () => {
  it('gives up (null) when the website refuses, fails or does not send an image', async () => {
    expect(await inlineRemoteImage('https://x.y/a.png', vi.fn(async () => new Response('', { status: 404 })))).toBeNull();
    expect(await inlineRemoteImage('https://x.y/a.png', vi.fn(async () => Promise.reject(new TypeError('CORS'))))).toBeNull();
    expect(await inlineRemoteImage('https://x.y/a.png', vi.fn(async () => new Response('<html>', { headers: { 'content-type': 'text/html' } })))).toBeNull();
  });

  it('sends no cookies or referrer', async () => {
    const f = vi.fn(async () => new Response('', { status: 500 }));
    await inlineRemoteImage('//x.y/a.png', f);
    expect(f).toHaveBeenCalledWith('https://x.y/a.png', expect.objectContaining({ credentials: 'omit', referrerPolicy: 'no-referrer', mode: 'cors' }));
  });
});
