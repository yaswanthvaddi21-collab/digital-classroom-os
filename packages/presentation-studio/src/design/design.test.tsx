// @vitest-environment jsdom
import { ToastProvider } from '@dcos/ui';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createPresentation, createSlide } from '../create';
import { clearClipboardForTests } from '../editor/clipboard';
import type { PresentationImageHost } from '../hosts';
import { layoutIdFor } from '../layouts';
import { PresentationEditor } from '../PresentationEditor';
import { decorationsOf } from '../render/SlideView';
import { presentationProblems } from '../safety';
import { plainTextOf, richTextFromPlain, type ImageElement, type PresentationContent, type TextElement } from '../types';

beforeAll(() => {
  let n = 0;
  URL.createObjectURL = vi.fn(() => `blob:test/${++n}`);
  URL.revokeObjectURL = vi.fn();
  HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
});
afterEach(() => {
  cleanup();
  clearClipboardForTests();
  vi.unstubAllGlobals();
});

const json = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

/** Slide 1 "Cells" (title slide), slide 2 "Organelles" (title and content), slide 3 (title and content, hand-moved title). */
function deck(): PresentationContent {
  const p = createPresentation('blank');
  const s2 = createSlide(p, layoutIdFor('titleContent'));
  const s3 = createSlide(p, layoutIdFor('titleContent'));
  const fill = <T extends { elements: PresentationContent['slides'][number]['elements'] }>(s: T, texts: Record<string, string>) => ({
    ...s,
    elements: s.elements.map((e) => (e.type === 'text' && e.placeholderId && texts[e.placeholderId] ? { ...e, text: richTextFromPlain(texts[e.placeholderId]) } : e)),
  });
  p.slides = [
    { ...fill(p.slides[0], { title: 'Cells', subtitle: 'Biology' }), id: 's1' },
    { ...fill(s2, { title: 'Organelles', body: 'Nucleus' }), id: 's2' },
    { ...fill(s3, { title: 'Membranes' }), id: 's3' },
  ];
  p.slides[2].elements = p.slides[2].elements.map((e) => (e.placeholderId === 'title' ? { ...e, x: 300 } : e));
  return p;
}

function memoryHost() {
  const store = new Map<string, Blob>();
  let n = 0;
  const host: PresentationImageHost & { store: Map<string, Blob> } = {
    store,
    putAttachment: vi.fn(async (b: Blob, mimeType: string) => {
      const id = `att-${++n}`;
      store.set(id, b);
      return { id, mimeType, sizeBytes: b.size };
    }),
    loadAttachment: vi.fn(async (id: string) => store.get(id)),
  };
  return host;
}

function setup(content: PresentationContent = deck(), imageHost?: PresentationImageHost) {
  const onChange = vi.fn();
  const view = render(
    <ToastProvider>
      <PresentationEditor initialContent={json(content)} title="Talk" onChange={onChange} imageHost={imageHost} />
    </ToastProvider>,
  );
  const last = (): PresentationContent => onChange.mock.calls.at(-1)![0];
  return { onChange, last, view };
}

/** A modal dialog by its heading (the app's Dialog names itself with a heading, not aria-labelledby). */
const dialogTitled = (title: string) => screen.getAllByRole('dialog').find((d) => within(d).queryByRole('heading', { name: title }))!;
const noDialogTitled = (title: string) => !screen.queryAllByRole('dialog').some((d) => within(d).queryByRole('heading', { name: title }));
const designTab = () => fireEvent.click(screen.getByRole('tab', { name: 'Design' }));
const toolbar = (name: string) => screen.getByRole('toolbar', { name });
const slideOptions = () => within(screen.getByRole('listbox', { name: 'Slides' })).getAllByRole('option');
const undo = () => fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
const title = (p: PresentationContent, i: number) => p.slides[i].elements.find((e) => e.placeholderId === 'title') as TextElement;
function pick(el: HTMLElement) {
  fireEvent.pointerDown(el, { button: 0, pointerId: 1, clientX: 100, clientY: 100 });
  fireEvent.pointerUp(window, { pointerId: 1, clientX: 100, clientY: 100 });
}

describe('Design tab', () => {
  it('shows a Design tab whose controls all work', () => {
    setup();
    designTab();
    const bar = toolbar('Design');
    expect(within(bar).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['Themes', 'Format background', 'Layout', 'Reset slide', 'Edit the slide master and layouts']);
    expect(within(bar).getByRole('combobox', { name: 'Slide size' })).toBeTruthy();
  });

  it('applies a theme, a colour set and fonts from the gallery, each one undo step', () => {
    const { last } = setup();
    designTab();
    fireEvent.click(screen.getByRole('button', { name: 'Themes' }));
    const gallery = screen.getByRole('dialog', { name: 'Themes' });
    expect(within(gallery).getByRole('radio', { name: 'Classroom theme' }).getAttribute('aria-checked')).toBe('true');
    // Arrow keys move between the themes (radio group pattern).
    within(gallery).getByRole('radio', { name: 'Classroom theme' }).focus();
    fireEvent.keyDown(within(gallery).getByRole('radio', { name: 'Classroom theme' }), { key: 'ArrowRight' });
    expect(document.activeElement).toBe(within(gallery).getByRole('radio', { name: 'Chalkboard theme' }));
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' });
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(within(gallery).getByRole('radio', { name: 'High contrast theme' }));
    fireEvent.click(within(gallery).getByRole('radio', { name: 'Midnight theme' }));
    expect(last().themeId).toBe('midnight');
    expect(last().theme.colors.light1).toBe('#0f172a');
    expect(screen.queryByRole('dialog', { name: 'Themes' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Themes' }).textContent).toContain('Midnight');

    fireEvent.click(screen.getByRole('button', { name: 'Themes' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Sunrise colours' }));
    expect(last()).toMatchObject({ themeId: 'custom', theme: { name: 'Custom', fonts: { heading: 'Trebuchet MS' } } });
    expect(last().theme.colors.accent1).toBe('#ea580c');
    fireEvent.change(screen.getByRole('combobox', { name: 'Heading font' }), { target: { value: 'Georgia' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Body font' }), { target: { value: 'Verdana' } });
    expect(last().theme.fonts).toEqual({ heading: 'Georgia', body: 'Verdana' });
    undo();
    expect(last().theme.fonts).toEqual({ heading: 'Georgia', body: 'Trebuchet MS' });
    undo();
    undo();
    expect(last().themeId).toBe('midnight');
    expect(presentationProblems(json(last()))).toEqual([]);
  });

  it('changes the slide size and back', () => {
    const { last } = setup();
    designTab();
    fireEvent.change(screen.getByRole('combobox', { name: 'Slide size' }), { target: { value: '4:3' } });
    expect(last().size).toEqual({ width: 960, height: 720 });
    expect(title(last(), 1).y).toBeGreaterThan(title(deck(), 1).y);
    undo();
    expect(last().size).toEqual({ width: 960, height: 540 });
  });

  it('changes the selected slides’ layout from the Layout menu, keeping their text, and resets a slide', () => {
    const { last } = setup();
    fireEvent.click(slideOptions()[1]);
    fireEvent.click(slideOptions()[2], { shiftKey: true });
    designTab();
    expect(screen.getByRole('button', { name: 'Layout of the selected slides' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Layout of the selected slides' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Two content' }));
    expect(last().slides.map((s) => s.layoutId)).toEqual([layoutIdFor('title'), layoutIdFor('twoContent'), layoutIdFor('twoContent')]);
    const s2 = last().slides[1].elements;
    expect(s2.map((e) => [e.placeholderId, e.type === 'text' ? plainTextOf(e.text) : ''])).toEqual(
      expect.arrayContaining([
        ['title', 'Organelles'],
        ['left', 'Nucleus'],
        ['right', ''],
      ]),
    );
    expect(title(last(), 2).x).toBe(300); // moved by hand: stays

    fireEvent.click(slideOptions()[2]);
    fireEvent.click(screen.getByRole('button', { name: 'Reset slide' }));
    expect(title(last(), 2).x).toBe(48);
    expect(plainTextOf(title(last(), 2).text)).toBe('Membranes');
  });
});

describe('Format background', () => {
  it('colours, gradients, a picture, reset and apply to all', async () => {
    const host = memoryHost();
    const { last } = setup(deck(), host);
    fireEvent.click(slideOptions()[1]);
    designTab();
    fireEvent.click(screen.getByRole('button', { name: 'Format background' }));
    const dialog = dialogTitled('Format background');
    expect(within(dialog).getByText('Slide 2')).toBeTruthy();
    expect(within(dialog).getByRole('radio', { name: 'Solid colour' }).getAttribute('aria-checked')).toBe('true');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Accent 1 (#2563eb)' }));
    expect(last().slides[1].background).toEqual({ type: 'solid', color: { theme: 'accent1' } });
    expect(last().slides[0].background).toBeUndefined();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Colour #ffc000' }));
    expect(last().slides[1].background).toEqual({ type: 'solid', color: '#ffc000' });
    // Dragging in the system colour picker: many changes, one undo step.
    fireEvent.change(within(dialog).getByLabelText('Custom colour'), { target: { value: '#112233' } });
    fireEvent.change(within(dialog).getByLabelText('Custom colour'), { target: { value: '#445566' } });
    expect(last().slides[1].background).toEqual({ type: 'solid', color: '#445566' });
    undo();
    expect(last().slides[1].background).toEqual({ type: 'solid', color: '#ffc000' });

    fireEvent.click(within(dialog).getByRole('radio', { name: 'Gradient' }));
    expect(last().slides[1].background).toMatchObject({ type: 'gradient', angle: 90, stops: [{ position: 0, color: '#ffc000' }, { position: 1 }] });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Warm gradient' }));
    expect(last().slides[1].background).toEqual({ type: 'gradient', angle: 90, stops: [{ position: 0, color: { theme: 'accent3' } }, { position: 1, color: { theme: 'accent4' } }] });
    fireEvent.change(within(dialog).getByRole('combobox', { name: 'Gradient direction' }), { target: { value: '0' } });
    fireEvent.change(within(dialog).getByLabelText('End colour'), { target: { value: '#000000' } });
    expect(last().slides[1].background).toEqual({ type: 'gradient', angle: 0, stops: [{ position: 0, color: { theme: 'accent3' } }, { position: 1, color: '#000000' }] });

    // A file that is not a picture is refused with a message; a picture is stored and used.
    const input = within(dialog).getByLabelText('Background picture file') as HTMLInputElement;
    const clicked = vi.spyOn(input, 'click');
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Picture…' }));
    expect(clicked).toHaveBeenCalled();
    fireEvent.change(input, { target: { files: [new File(['x'], 'notes.txt', { type: 'text/plain' })] } });
    expect(await screen.findByText('Choose a PNG, JPEG, GIF or WebP picture.')).toBeTruthy();
    expect(host.putAttachment).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { files: [new File(['png'], 'sky.png', { type: 'image/png' })] } });
    await waitFor(() => expect(last().slides[1].background).toEqual({ type: 'image', attachmentId: 'att-1', fit: 'cover' }));
    fireEvent.change(within(dialog).getByRole('combobox', { name: 'Picture fit' }), { target: { value: 'contain' } });
    expect(last().slides[1].background).toEqual({ type: 'image', attachmentId: 'att-1', fit: 'contain' });
    await waitFor(() => expect((dialog.querySelector('[data-background-preview]') as HTMLElement).style.backgroundImage).toContain('blob:test'));

    fireEvent.click(within(dialog).getByRole('button', { name: 'Reset to the layout’s background' }));
    expect(last().slides[1].background).toBeUndefined();
    expect(within(dialog).queryByRole('button', { name: 'Reset to the layout’s background' })).toBeNull();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Accent 2 (#16a34a)' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Apply to all slides' }));
    expect(last().masters[0].background).toEqual({ type: 'solid', color: { theme: 'accent2' } });
    expect(last().slides.every((s) => s.background === undefined)).toBe(true);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }));
    expect(noDialogTitled('Format background')).toBe(true);
    expect(presentationProblems(json(last()))).toEqual([]);
  });

  it('offers no picture without an image host', () => {
    setup();
    designTab();
    fireEvent.click(screen.getByRole('button', { name: 'Format background' }));
    expect(screen.queryByRole('radio', { name: /Picture/ })).toBeNull();
  });
});

describe('slide menu', () => {
  it('Layout…, Format background… and Reset slide', () => {
    const { last } = setup();
    fireEvent.click(slideOptions()[1]);
    fireEvent.click(screen.getByRole('button', { name: 'Slide actions' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Layout…' }));
    const dialog = dialogTitled('Layout');
    expect(within(dialog).getByRole('radio', { name: 'Title and content' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Section header' }));
    expect(last().slides[1].layoutId).toBe(layoutIdFor('sectionHeader'));
    expect(noDialogTitled('Layout')).toBe(true);
    expect(plainTextOf((last().slides[1].elements.find((e) => e.placeholderId === 'body') as TextElement).text)).toBe('Nucleus');

    fireEvent.click(screen.getByRole('button', { name: 'Slide actions' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Format background…' }));
    fireEvent.click(within(dialogTitled('Format background')).getByRole('button', { name: 'Accent 3 (#f59e0b)' }));
    expect(last().slides[1].background).toEqual({ type: 'solid', color: { theme: 'accent3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    fireEvent.click(slideOptions()[2]);
    fireEvent.contextMenu(slideOptions()[2], { clientX: 10, clientY: 10 });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Reset slide' }));
    expect(title(last(), 2).x).toBe(48);
  });
});

describe('master view', () => {
  const openMaster = () => {
    designTab();
    fireEvent.click(screen.getByRole('button', { name: 'Edit the slide master and layouts' }));
  };
  const objectsOn = (name: RegExp) => screen.getByRole('listbox', { name });
  const targets = () => within(screen.getByRole('listbox', { name: 'Slide master and layouts' })).getAllByRole('option');

  it('opens on the current slide’s layout, lists the master and its layouts, and closes back to the slides', () => {
    setup();
    fireEvent.click(slideOptions()[1]);
    openMaster();
    expect(screen.queryByRole('listbox', { name: 'Slides' })).toBeNull();
    expect(targets().map((o) => o.getAttribute('aria-label'))).toEqual([
      'Slide master: Default, used by all 3 slides',
      'Title slide layout, used by 1 slide',
      'Title and content layout, used by 2 slides',
      'Two content layout, not used',
      'Section header layout, not used',
      'Title only layout, not used',
      'Blank layout, not used',
      'Comparison layout, not used',
      'Picture with caption layout, not used',
    ]);
    expect(targets()[2].getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('status').textContent).toMatch(/the “Title and content” layout \(2 slides use it\)/);
    expect(within(objectsOn(/^Objects on the Title and content layout/)).getAllByRole('option').map((o) => o.getAttribute('aria-label'))).toEqual([
      'Title placeholder: empty (Click to add title)',
      'Text placeholder: empty (Click to add text)',
    ]);
    fireEvent.keyDown(screen.getByRole('listbox', { name: 'Slide master and layouts' }), { key: 'Home' });
    expect(targets()[0].getAttribute('aria-selected')).toBe('true');
    expect(objectsOn(/^Objects on the slide master$/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close master view' }));
    expect(screen.getByRole('listbox', { name: 'Slides' })).toBeTruthy();
  });

  it('formats and moves layout placeholders; the slides follow except where changed by hand', () => {
    const { last } = setup();
    fireEvent.click(slideOptions()[1]);
    openMaster();
    const canvas = objectsOn(/^Objects on the Title and content layout/);
    pick(within(canvas).getAllByRole('option')[0]);
    // A placeholder has resize handles but no rotate handle.
    expect(document.querySelectorAll('[data-handle="n"]').length).toBe(1);
    expect(document.querySelector('[data-handle="rotate"]')).toBeNull();
    const bar = toolbar('Slide Master');
    fireEvent.change(within(bar).getByRole('combobox', { name: 'Font size' }), { target: { value: '40' } });
    const layout = () => last().layouts.find((l) => l.id === layoutIdFor('titleContent'))!;
    expect(layout().placeholders[0].style.fontSize).toBe(40);
    expect(title(last(), 1).style.fontSize).toBe(40);
    expect(title(last(), 2).style.fontSize).toBe(40);
    expect(title(last(), 0).style.fontSize).toBe(44); // another layout
    fireEvent.click(within(bar).getByRole('button', { name: 'Bold' }));
    expect(title(last(), 1).style.bold).toBe(false);
    fireEvent.click(within(bar).getByRole('button', { name: 'Italic' }));
    fireEvent.click(within(bar).getByRole('button', { name: 'Align right' }));
    fireEvent.change(within(bar).getByRole('combobox', { name: 'Vertical alignment' }), { target: { value: 'bottom' } });
    fireEvent.change(within(bar).getByRole('combobox', { name: 'Font' }), { target: { value: 'Georgia' } });
    fireEvent.click(within(bar).getByRole('button', { name: 'Text colour' }));
    fireEvent.click(screen.getByRole('button', { name: 'Accent 2 (#16a34a)' }));
    expect(title(last(), 1).style).toMatchObject({ italic: true, align: 'right', verticalAlign: 'bottom', font: 'Georgia', color: { theme: 'accent2' } });

    // Nudged with the arrow keys: slide 2's title moves with it, slide 3's (moved by hand) does not.
    const x2 = title(last(), 1).x;
    fireEvent.keyDown(canvas, { key: 'ArrowRight', shiftKey: true });
    expect(layout().placeholders[0].x).toBe(x2 + 10);
    expect(title(last(), 1).x).toBe(x2 + 10);
    expect(title(last(), 2).x).toBe(300);
    undo();
    expect(title(last(), 1).x).toBe(x2);
    expect(presentationProblems(json(last()))).toEqual([]);
  });

  it('a master placeholder change reaches every layout and slide that follows it', () => {
    const { last } = setup();
    openMaster();
    fireEvent.keyDown(screen.getByRole('listbox', { name: 'Slide master and layouts' }), { key: 'Home' });
    pick(within(objectsOn(/^Objects on the slide master$/)).getAllByRole('option')[0]);
    fireEvent.click(within(toolbar('Slide Master')).getByRole('button', { name: 'Text colour' }));
    fireEvent.click(screen.getByRole('button', { name: 'Accent 1 (#2563eb)' }));
    expect(last().masters[0].placeholders[0].style.color).toEqual({ theme: 'accent1' });
    expect(last().layouts.every((l) => !l.placeholders.some((ph) => ph.id === 'title') || JSON.stringify(l.placeholders.find((ph) => ph.id === 'title')!.style.color) === '{"theme":"accent1"}')).toBe(true);
    expect(last().slides.map((_s, i) => title(last(), i).style.color)).toEqual([{ theme: 'accent1' }, { theme: 'accent1' }, { theme: 'accent1' }]);
    // The master's placeholders cannot be deleted (layouts start from them).
    expect(within(toolbar('Slide Master')).getByRole('button', { name: 'Delete' })).toHaveProperty('disabled', true);
  });

  it('adds, arranges, duplicates and deletes decorations, which the slides show', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 400, height: 200, close() {} })));
    const host = memoryHost();
    const { last } = setup(deck(), host);
    openMaster();
    fireEvent.keyDown(screen.getByRole('listbox', { name: 'Slide master and layouts' }), { key: 'Home' });
    const bar = toolbar('Slide Master');
    fireEvent.click(within(bar).getByRole('button', { name: 'Rectangle' }));
    fireEvent.click(within(bar).getByRole('button', { name: 'Line' }));
    const decs = () => last().masters[0].decorations;
    expect(decs().map((d) => (d.type === 'shape' ? d.preset : d.type))).toEqual(['rect', 'line']);
    expect(decorationsOf(last(), last().slides[1]).length).toBe(2);
    fireEvent.click(within(bar).getByRole('button', { name: 'Send to back' }));
    expect(decs().map((d) => (d.type === 'shape' ? d.preset : d.type))).toEqual(['line', 'rect']);
    fireEvent.click(within(bar).getByRole('button', { name: 'Bring to front' }));
    expect(decs().map((d) => (d.type === 'shape' ? d.preset : d.type))).toEqual(['rect', 'line']);

    // A picture (a logo): stored through the image host, sized from the picture.
    fireEvent.change(screen.getByLabelText('Picture file'), { target: { files: [new File(['png'], 'Logo.png', { type: 'image/png' })] } });
    await waitFor(() => expect(decs()).toHaveLength(3));
    expect(decs()[2]).toMatchObject({ type: 'image', attachmentId: 'att-1', naturalWidth: 400, naturalHeight: 200, w: 288, h: 144, alt: 'Logo' } satisfies Partial<ImageElement>);

    // A text box decoration starts in editing.
    fireEvent.click(within(bar).getByRole('button', { name: 'Text box' }));
    expect(document.querySelector('[data-stage] .ProseMirror')).not.toBeNull();
    expect(decs()[3].type).toBe('text');
    fireEvent.keyDown(document.querySelector('[data-stage] .ProseMirror')!, { key: 'Escape' });

    // The object menu: duplicate the picture, then delete the copy.
    const canvas = objectsOn(/^Objects on the slide master$/);
    pick(within(canvas).getAllByRole('option', { name: /^Picture/ })[0]);
    fireEvent.contextMenu(canvas, { clientX: 50, clientY: 50 });
    fireEvent.click(screen.getByRole('menuitem', { name: /^Duplicate/ }));
    expect(decs().filter((d) => d.type === 'image')).toHaveLength(2);
    fireEvent.click(within(bar).getByRole('button', { name: 'Delete' }));
    expect(decs().filter((d) => d.type === 'image')).toHaveLength(1);
    fireEvent.keyDown(canvas, { key: 'a', ctrlKey: true });
    fireEvent.keyDown(canvas, { key: 'Delete' });
    expect(decs()).toEqual([]);
    expect(last().masters[0].placeholders.map((ph) => ph.id)).toEqual(['title', 'body']); // placeholders stay
    expect(presentationProblems(json(last()))).toEqual([]);
  });

  it('layouts: a text placeholder, hiding the master graphics and a background of their own', () => {
    const { last } = setup();
    fireEvent.click(slideOptions()[1]);
    openMaster();
    const bar = toolbar('Slide Master');
    const layout = () => last().layouts.find((l) => l.id === layoutIdFor('titleContent'))!;
    fireEvent.click(within(bar).getByRole('button', { name: 'Text placeholder' }));
    expect(layout().placeholders.map((ph) => ph.id)).toEqual(['title', 'body', 'text-1']);
    expect(within(objectsOn(/^Objects on the Title and content layout/)).getAllByRole('option')[2].getAttribute('aria-selected')).toBe('true');
    fireEvent.click(within(bar).getByRole('button', { name: 'Delete' }));
    expect(layout().placeholders.map((ph) => ph.id)).toEqual(['title', 'body']);

    fireEvent.click(within(bar).getByRole('button', { name: 'Hide master graphics' }));
    expect(layout().showMasterDecorations).toBe(false);
    expect(within(bar).getByRole('button', { name: 'Hide master graphics' }).getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(within(bar).getByRole('button', { name: 'Format background' }));
    const dialog = dialogTitled('Format background');
    expect(within(dialog).getByText('“Title and content” layout')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Text 2 (#1e3a5f)' }));
    expect(layout().background).toEqual({ type: 'solid', color: { theme: 'dark2' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Use the master’s background' }));
    expect(layout().background).toBeUndefined();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }));

    // The Undo button in master view uses the one history.
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(layout().background).toEqual({ type: 'solid', color: { theme: 'dark2' } });
    expect(presentationProblems(json(last()))).toEqual([]);
  });
});
