// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createPresentation } from './create';
import type { PresentationImageHost } from './hosts';
import { PresentationEditor, WIDE_LAYOUT_QUERY } from './PresentationEditor';
import { RichText, safeHref, fontSizePx } from './render/RichText';
import { SlideView } from './render/SlideView';
import { kitchenSinkPresentation } from './testFixtures';
import { richTextFromPlain, type PresentationContent, type RichTextDoc } from './types';

const download = vi.hoisted(() => vi.fn());
vi.mock('@dcos/ui', async (original) => ({ ...(await original<typeof import('@dcos/ui')>()), downloadBlob: download }));

beforeAll(() => {
  // jsdom has no object URLs.
  let n = 0;
  URL.createObjectURL = vi.fn(() => `blob:test/${++n}`);
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  cleanup();
  download.mockClear();
});

const json = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

/** Three slides with titles and notes. */
function threeSlides(): PresentationContent {
  const p = createPresentation('blank');
  const titled = (text: string, notes = '') => {
    const s = json(p.slides[0]);
    s.id = `s-${text}`;
    s.elements = s.elements.map((e) => (e.type === 'text' && e.placeholderId === 'title' ? { ...e, id: `${e.id}-${text}`, text: richTextFromPlain(text) } : { ...e, id: `${e.id}-${text}` }));
    s.notes = richTextFromPlain(notes);
    return s;
  };
  p.slides = [titled('Intro', 'Say hello'), titled('Method'), { ...titled('Results'), hidden: true }];
  return p;
}

/** The same three slides, from a newer version: opened in the protected (read-only) view. */
const newerThreeSlides = () => ({ ...json(threeSlides()), schemaVersion: 2 });

describe('PresentationEditor protected view (read-only)', () => {
  it('draws links on slides as text (nothing focusable inside a slide picture or a slide-list button), but keeps links in the notes', () => {
    const p = threeSlides();
    const link: RichTextDoc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'the source', marks: [{ type: 'link', attrs: { href: 'https://example.org/' } }] }] }] };
    p.slides[0].elements = p.slides[0].elements.map((e) => (e.type === 'text' && e.placeholderId === 'title' ? { ...e, text: json(link) } : e));
    p.slides[0].notes = json(link);
    const { container } = render(<PresentationEditor initialContent={{ ...json(p), schemaVersion: 2 }} title="Talk" onChange={vi.fn()} />);
    expect(within(screen.getByRole('listbox', { name: 'Slides' })).queryAllByRole('link')).toEqual([]);
    expect(container.querySelectorAll('[data-slide] a')).toHaveLength(0);
    expect(container.querySelectorAll('[data-slide]')[0].textContent).toContain('the source');
    expect(within(screen.getByRole('region', { name: 'Speaker notes' })).getByRole('link', { name: 'the source' }).getAttribute('href')).toBe('https://example.org/');
  });

  it('lists every slide with its number and title, and shows the first one with its notes', () => {
    const onChange = vi.fn();
    render(<PresentationEditor initialContent={newerThreeSlides()} title="Talk" onChange={onChange} />);
    const list = screen.getByRole('listbox', { name: 'Slides' });
    const options = within(list).getAllByRole('option');
    expect(options.map((o) => o.getAttribute('aria-label'))).toEqual(['Slide 1: Intro', 'Slide 2: Method', 'Slide 3: Results (hidden in the slide show)']);
    expect(options[0].getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('img', { name: 'Slide 1: Intro' })).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'Speaker notes' })).getByText('Say hello')).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows the slide that is clicked, and moves with the arrow keys, Home and End', () => {
    render(<PresentationEditor initialContent={newerThreeSlides()} title="Talk" onChange={vi.fn()} />);
    const options = screen.getAllByRole('option');
    fireEvent.click(options[1]);
    expect(screen.getByRole('img', { name: 'Slide 2: Method' })).toBeTruthy();
    expect(screen.getByText('No notes for this slide.')).toBeTruthy();
    fireEvent.keyDown(options[1], { key: 'ArrowDown' });
    expect(screen.getByRole('img', { name: 'Slide 3: Results (hidden in the slide show)' })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getAllByRole('option')[2]);
    fireEvent.keyDown(options[2], { key: 'ArrowDown' });
    expect(screen.getAllByRole('option')[2].getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(options[2], { key: 'Home' });
    expect(screen.getByRole('img', { name: 'Slide 1: Intro' })).toBeTruthy();
    fireEvent.keyDown(options[0], { key: 'End' });
    expect(screen.getAllByRole('option')[2].getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(options[2], { key: 'ArrowUp' });
    expect(screen.getAllByRole('option')[1].getAttribute('aria-selected')).toBe('true');
    // Only the selected slide is in the tab order.
    expect(screen.getAllByRole('option').map((o) => o.tabIndex)).toEqual([-1, 0, -1]);
  });

  // verify-R1: below md the list is a horizontal strip, so it must not be announced as vertical.
  for (const view of ['protected', 'editor'] as const) {
    it(`announces the slide list as a horizontal strip at phone width and a vertical column when wide, following resizes (${view})`, () => {
      const listeners = new Set<() => void>();
      const mq = { matches: false, media: WIDE_LAYOUT_QUERY, addEventListener: (_: string, f: () => void) => listeners.add(f), removeEventListener: (_: string, f: () => void) => listeners.delete(f) };
      const matchMedia = vi.fn((q: string) => (q === WIDE_LAYOUT_QUERY ? mq : { ...mq, matches: false }));
      vi.stubGlobal('matchMedia', matchMedia);
      try {
        const { unmount } = render(<PresentationEditor initialContent={view === 'protected' ? newerThreeSlides() : threeSlides()} title="Talk" onChange={vi.fn()} />);
        const list = screen.getByRole('listbox', { name: 'Slides' });
        expect(list.getAttribute('aria-orientation')).toBe('horizontal');
        act(() => {
          mq.matches = true;
          listeners.forEach((f) => f());
        });
        expect(list.getAttribute('aria-orientation')).toBe('vertical');
        // Left and Right move along the strip.
        fireEvent.keyDown(within(list).getAllByRole('option')[0], { key: 'ArrowRight' });
        expect(within(list).getAllByRole('option')[1].getAttribute('aria-selected')).toBe('true');
        unmount();
        expect(listeners.size).toBe(0);
      } finally {
        vi.unstubAllGlobals();
      }
    });
  }

  it('has no editing controls and shows no placeholder prompts', () => {
    const { container } = render(<PresentationEditor initialContent={{ ...json(createPresentation('blank')), schemaVersion: 2 }} title="New" onChange={vi.fn()} />);
    expect(container.textContent).not.toMatch(/Click to add/);
    // The only button is the working "Download original data"; the rest are the slide list's options.
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Download original data']);
    expect(screen.queryByRole('tablist')).toBeNull();
  });

  it('opens a presentation from a newer version read-only and offers its original data, never saving', async () => {
    const newer = newerThreeSlides();
    const onChange = vi.fn();
    render(<PresentationEditor initialContent={newer} title="Future talk" onChange={onChange} />);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toMatch(/Opened read-only to protect this presentation/);
    expect(alert.textContent).toMatch(/saved by a newer version of Classroom OS/);
    expect(screen.getAllByRole('option')).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: 'Download original data' }));
    expect(download).toHaveBeenCalledTimes(1);
    const [blob, name] = download.mock.calls[0] as [Blob, string];
    expect(name).toBe('Future talk (original data).json');
    expect(JSON.parse(await blob.text())).toEqual(newer);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('opens damaged content read-only instead of failing', () => {
    render(<PresentationEditor initialContent={{ schemaVersion: 1, slides: [{ id: 'x', elements: 'no' }] }} title="Broken" onChange={vi.fn()} />);
    expect(screen.getByRole('alert').textContent).toMatch(/cannot display exactly/);
    expect(screen.getAllByRole('option')).toHaveLength(1);
  });

  it('says so when there are no slides', () => {
    render(<PresentationEditor initialContent={{ ...createPresentation(), slides: [], schemaVersion: 2 }} title="Empty" onChange={vi.fn()} />);
    expect(screen.getByText('This presentation has no slides.')).toBeTruthy();
  });
});

describe('SlideView', () => {
  const host = (have: string[]): PresentationImageHost & { loadAttachment: ReturnType<typeof vi.fn> } => ({
    putAttachment: vi.fn(),
    loadAttachment: vi.fn(async (id: string) => (have.includes(id) ? new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }) : undefined)),
  });

  it('draws every kind of object of the sample presentation', async () => {
    const p = kitchenSinkPresentation();
    const imageHost = host(['attachment-picture', 'attachment-diagram', 'attachment-background', 'attachment-logo']);
    for (const slide of p.slides) {
      const { container, unmount } = render(<SlideView content={p} slide={slide} scale={0.5} imageHost={imageHost} label="s" />);
      for (const el of slide.elements) expect(container.querySelector(`[data-element="${el.id}"]`)).not.toBeNull();
      unmount();
    }
    const withPictures = p.slides[1];
    const { container } = render(<SlideView content={p} slide={withPictures} scale={1} imageHost={imageHost} />);
    await waitFor(() => expect(container.querySelectorAll('img')).toHaveLength(3));
    expect([...container.querySelectorAll('img')].map((i) => i.getAttribute('alt'))).toEqual(['', 'A lab bench', 'The process']);
    expect(imageHost.loadAttachment).toHaveBeenCalledWith('attachment-background');
    expect(container.textContent).toContain('Bold italic underline');
    // On a slide (a picture) links are drawn as text; RichText elsewhere (the notes) keeps them as safe links.
    expect(container.querySelector('a')).toBeNull();
    const text = withPictures.elements.find((e) => e.type === 'text' && JSON.stringify(e.text).includes('"link"'));
    expect(text?.type).toBe('text');
    const links = render(<RichText doc={text!.type === 'text' ? text!.text : richTextFromPlain('')} theme={p.theme} />).container;
    expect(links.querySelector('a')?.getAttribute('href')).toBe('https://example.org/');
    expect(links.querySelector('a')?.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('shows a calm frame with the description for a picture that is not on this device', async () => {
    const p = kitchenSinkPresentation();
    const { container } = render(<SlideView content={p} slide={p.slides[1]} scale={1} imageHost={host([])} />);
    await waitFor(() => expect(container.textContent).toContain('Picture not on this device: A lab bench'));
    expect(container.textContent).toContain('Diagram: The process');
    expect(container.querySelector('img')).toBeNull();
  });

  it('draws the master and layout decorations behind the slide objects', () => {
    const p = kitchenSinkPresentation();
    const master = p.masters[0].decorations[0];
    const { container } = render(<SlideView content={p} slide={p.slides[0]} scale={1} />);
    const drawn = [...container.querySelectorAll('[data-element]')].map((e) => e.getAttribute('data-element'));
    expect(drawn[0]).toBe(master.id);
    p.layouts[0].showMasterDecorations = false;
    cleanup();
    const again = render(<SlideView content={p} slide={p.slides[0]} scale={1} />);
    expect(again.container.querySelector(`[data-element="${master.id}"]`)).toBeNull();
  });
});

describe('rich text safety', () => {
  it('follows only absolute http, https and mailto links', () => {
    expect(safeHref('https://a.org/x')).toBe('https://a.org/x');
    expect(safeHref('mailto:a@b.org')).toBe('mailto:a@b.org');
    expect(safeHref('javascript:alert(1)')).toBeNull();
    expect(safeHref('data:text/html,x')).toBeNull();
    expect(safeHref('/settings')).toBeNull();
    expect(safeHref(5)).toBeNull();
  });

  it('reads font sizes in points', () => {
    expect(fontSizePx('24pt')).toBe(32);
    expect(fontSizePx('12')).toBe(16);
    expect(fontSizePx('big')).toBeNull();
    expect(fontSizePx('0pt')).toBeNull();
  });
});
