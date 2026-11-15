// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { textStyle } from '../layouts';
import { richTextFromPlain, type SlideElement } from '../types';
import {
  clearClipboardForTests,
  copyElements,
  clipboardText,
  ELEMENTS_MIME,
  hasClipboardElements,
  onClipboardChange,
  parseElements,
  readPasteEvent,
  rememberedElements,
  rememberElements,
  serializeElements,
  writeElementsToEvent,
} from './clipboard';

const text = (id: string, s: string): SlideElement => ({ id, type: 'text', x: 1, y: 2, w: 3, h: 4, rotation: 0, text: richTextFromPlain(s), style: textStyle() });

/** A copy/paste event with a working clipboardData (jsdom has none). */
function clipEvent(data: Record<string, string> = {}) {
  const store = new Map(Object.entries(data));
  return {
    preventDefault: vi.fn(),
    clipboardData: {
      get types() {
        return [...store.keys()];
      },
      getData: (t: string) => store.get(t) ?? '',
      setData: (t: string, v: string) => void store.set(t, v),
    },
    store,
  };
}

afterEach(clearClipboardForTests);

describe('slide object clipboard', () => {
  it('round-trips objects through the web format and refuses anything this build cannot represent', () => {
    const els = [text('a', 'Hello'), text('b', 'World')];
    expect(parseElements(serializeElements(els))).toEqual(els);
    expect(parseElements('not json')).toBeNull();
    expect(parseElements(JSON.stringify({ format: 'other', version: 1, elements: els }))).toBeNull();
    expect(parseElements(JSON.stringify({ format: 'dcos-slide-elements', version: 2, elements: els }))).toBeNull();
    expect(parseElements(serializeElements([]))).toBeNull();
    // From a newer version: an unknown field, or an unknown element type.
    expect(parseElements(serializeElements([{ ...els[0], glow: true } as unknown as SlideElement]))).toBeNull();
    expect(parseElements(serializeElements([{ ...els[0], type: 'video' } as unknown as SlideElement]))).toBeNull();
    // Damaged.
    expect(parseElements(serializeElements([{ ...els[0], x: 'left' } as unknown as SlideElement]))).toBeNull();
  });

  it('writes the objects and their text to a copy event and to the in-app clipboard', () => {
    const changed = vi.fn();
    const stop = onClipboardChange(changed);
    const e = clipEvent();
    writeElementsToEvent(e as unknown as ClipboardEvent, [text('a', 'Hello')]);
    expect(e.preventDefault).toHaveBeenCalled();
    expect(e.store.get('text/plain')).toBe('Hello');
    expect(parseElements(e.store.get(ELEMENTS_MIME)!)).toHaveLength(1);
    expect(hasClipboardElements()).toBe(true);
    expect(changed).toHaveBeenCalledTimes(1);
    stop();
  });

  it('keeps deep copies, so later edits do not change what was copied', () => {
    const el = text('a', 'Hello');
    rememberElements([el]);
    (el as { x: number }).x = 500;
    expect(rememberedElements()[0].x).toBe(1);
    expect(rememberedElements()[0]).not.toBe(rememberedElements()[0]);
  });

  it('reads a paste: objects from the web format, objects from the in-app clipboard when only its text arrives, else plain text', () => {
    const els = [text('a', 'Hello')];
    expect(readPasteEvent(clipEvent({ [ELEMENTS_MIME]: serializeElements(els), 'text/plain': 'Hello' }) as unknown as ClipboardEvent)).toEqual({ kind: 'elements', elements: els });
    expect(readPasteEvent(clipEvent({ [ELEMENTS_MIME]: 'broken' }) as unknown as ClipboardEvent)).toBeNull();
    expect(readPasteEvent(clipEvent({ 'text/plain': 'Some notes' }) as unknown as ClipboardEvent)).toEqual({ kind: 'text', text: 'Some notes' });
    expect(readPasteEvent(clipEvent({}) as unknown as ClipboardEvent)).toBeNull();
    rememberElements(els);
    expect(readPasteEvent(clipEvent({ 'text/plain': 'Hello' }) as unknown as ClipboardEvent)).toEqual({ kind: 'elements', elements: els });
    expect(readPasteEvent(clipEvent({ 'text/plain': 'Other' }) as unknown as ClipboardEvent)).toEqual({ kind: 'text', text: 'Other' });
  });

  it('matches a copied picture (no text) only when the paste holds nothing else', () => {
    const picture: SlideElement = { id: 'p', type: 'image', x: 0, y: 0, w: 10, h: 10, rotation: 0, attachmentId: 'att', mimeType: 'image/png', naturalWidth: 10, naturalHeight: 10, fit: 'contain', alt: '' };
    rememberElements([picture]);
    expect(readPasteEvent(clipEvent({}) as unknown as ClipboardEvent)).toEqual({ kind: 'elements', elements: [picture] });
    expect(readPasteEvent(clipEvent({ Files: '' }) as unknown as ClipboardEvent)).toBeNull();
  });

  it('copyElements fills the system clipboard through a copy command, else writes the text the paste fallback matches', () => {
    const els = [text('a', 'Hello')];
    const doc = document as unknown as { execCommand?: (c: string) => boolean };
    const e = clipEvent();
    let selected = '';
    doc.execCommand = vi.fn(() => {
      selected = String(document.getSelection());
      const ev = new Event('copy', { bubbles: true, cancelable: true });
      Object.defineProperty(ev, 'clipboardData', { value: e.clipboardData });
      document.body.dispatchEvent(ev);
      return true;
    });
    const later = vi.fn();
    document.addEventListener('copy', later);
    try {
      expect(copyElements(els)).toBe(true);
      // The copy event is this copy's alone, made with something selected (Safari needs that); the selection goes after.
      expect(later).not.toHaveBeenCalled();
      expect(selected).toBe('Hello');
      expect(String(document.getSelection())).toBe('');
      expect(document.body.children).toHaveLength(0);
      expect(parseElements(e.store.get(ELEMENTS_MIME)!)).toEqual(els);
      expect(e.store.get('text/plain')).toBe('Hello');
    } finally {
      document.removeEventListener('copy', later);
      delete doc.execCommand;
    }
    // No copy command: the text goes to the system clipboard (where the browser allows it).
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    try {
      expect(copyElements([text('b', 'World')])).toBe(false);
      expect(writeText).toHaveBeenCalledWith('World');
      expect(readPasteEvent(clipEvent({ 'text/plain': 'World' }) as unknown as ClipboardEvent)).toMatchObject({ kind: 'elements', elements: [{ id: 'b' }] });
    } finally {
      delete (navigator as unknown as { clipboard?: unknown }).clipboard;
    }
  });

  it('prefers the in-app clipboard over an older copy of the same tab, never over another tab', () => {
    const e = clipEvent();
    writeElementsToEvent(e as unknown as ClipboardEvent, [text('old', 'Old')]);
    const older = e.store.get(ELEMENTS_MIME)!;
    rememberElements([text('new', 'New')]);
    expect(readPasteEvent(clipEvent({ [ELEMENTS_MIME]: older }) as unknown as ClipboardEvent)).toMatchObject({ kind: 'elements', elements: [{ id: 'new' }] });
    const other = serializeElements([text('far', 'Far')], { tab: 'another', seq: 1 });
    expect(readPasteEvent(clipEvent({ [ELEMENTS_MIME]: other }) as unknown as ClipboardEvent)).toMatchObject({ kind: 'elements', elements: [{ id: 'far' }] });
  });

  it('gives other apps the text of text boxes, shapes and tables', () => {
    expect(clipboardText([text('a', 'One'), text('b', ' ')])).toBe('One');
  });
});
