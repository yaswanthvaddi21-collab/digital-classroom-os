import { expect, test, type Page } from './fixtures';
import { createFromQuickStart, readStore, waitSaved } from './helpers';

/**
 * Presentation Studio editor core (Phase 7 Round 2a) in a real browser: slides (new, layouts, reorder by keyboard and
 * by dragging, duplicate, delete and undo), text typed into placeholders and text boxes, moving with smart guides,
 * copy and paste to another slide, speaker notes, and a reload that keeps everything. Then the same editor at phone
 * width.
 */

type Text = { type: 'text'; text: string };
type Doc = { type: 'doc'; content: Array<{ type: string; content?: Array<Text | Doc['content'][number]> }> };
type El = { id: string; type: string; x: number; y: number; w: number; h: number; placeholderId?: string; text?: Doc };
type Content = { slides: Array<{ id: string; layoutId: string; elements: El[]; notes: Doc; hidden?: boolean }> };
type Item = { id: string; content: Content };

const plain = (doc: Doc | undefined): string =>
  (doc?.content ?? [])
    .map((b) => JSON.stringify(b).match(/"text":"([^"]*)"/g)?.map((m) => m.slice(8, -1)).join('') ?? '')
    .join('\n');

async function stored(page: Page, id: string): Promise<Content> {
  const items = await readStore<Item>(page, 'presentations');
  return items.find((i) => i.id === id)!.content;
}

const slides = (page: Page) => page.getByRole('listbox', { name: 'Slides' });
const slideOption = (page: Page, n: number) => slides(page).getByRole('option').nth(n);
const canvas = (page: Page) => page.getByRole('listbox', { name: /^Objects on slide/ });
const labels = (page: Page) => slides(page).getByRole('option').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
const mod = (page: Page) => page.evaluate(() => /Mac/.test(navigator.platform)).then((mac) => (mac ? 'Meta' : 'Control'));

/** Double-clicks an object on the canvas, types, and leaves the text with Escape. */
async function typeInto(page: Page, object: RegExp, text: string) {
  await canvas(page).getByRole('option', { name: object }).dblclick();
  await expect(page.locator('[data-stage] .ProseMirror')).toBeFocused();
  await page.keyboard.type(text);
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-stage] .ProseMirror')).toHaveCount(0);
}

test('create, type, add and reorder slides, move with guides, copy, duplicate, delete, undo, and reload', async ({ page }) => {
  const id = await createFromQuickStart(page, 'Blank presentation');
  const M = await mod(page);
  await expect(slides(page).getByRole('option')).toHaveCount(1);

  // Type the title of the title slide.
  await typeInto(page, /^Title placeholder/, 'Cell biology');
  await expect(slideOption(page, 0)).toHaveAccessibleName('Slide 1: Cell biology');

  // Two new slides (Title and content), and one more with a picked layout.
  await page.getByRole('toolbar', { name: 'Home' }).getByRole('button', { name: 'New slide', exact: true }).click();
  await typeInto(page, /^Title placeholder/, 'Organelles');
  await page.getByRole('toolbar', { name: 'Home' }).getByRole('button', { name: 'New slide', exact: true }).click();
  await typeInto(page, /^Title placeholder/, 'Membranes');
  await page.getByRole('toolbar', { name: 'Home' }).getByRole('button', { name: 'New slide with layout' }).click();
  await page.getByRole('menuitem', { name: 'Section header' }).click();
  await typeInto(page, /^Title placeholder/, 'Summary');
  await expect(slides(page).getByRole('option')).toHaveCount(4);

  // A text box on slide 2, moved with the mouse until its left edge snaps to the slide's left edge.
  await slideOption(page, 1).click();
  await page.getByRole('tab', { name: 'Insert' }).click();
  await page.getByRole('button', { name: 'Text box' }).click();
  await expect(page.locator('[data-stage] .ProseMirror')).toBeFocused();
  await page.keyboard.type('Nucleus and mitochondria');
  await page.keyboard.press('Escape');
  const box = canvas(page).getByRole('option', { name: /^Text box: Nucleus/ });
  const b = (await box.boundingBox())!;
  const stage = (await page.locator('[data-stage]').boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  // Left edge 3 screen pixels right of the slide's edge: within the 6 px snapping distance.
  const target = { x: b.x + b.width / 2 - (b.x - stage.x) + 3, y: b.y + b.height / 2 + 40 };
  await page.mouse.move(target.x, target.y, { steps: 8 });
  await expect(page.locator('[data-guide="x"]')).not.toHaveCount(0);
  await page.mouse.up();
  await expect(page.locator('[data-guide]')).toHaveCount(0);
  await waitSaved(page);
  await expect.poll(async () => (await stored(page, id)).slides[1].elements.find((e) => e.placeholderId === undefined)?.x).toBe(0);

  // Copy it to slide 4 with the keyboard.
  await box.click();
  await page.keyboard.press(`${M}+c`);
  await slideOption(page, 3).click();
  await canvas(page).focus();
  await page.keyboard.press(`${M}+v`);
  await expect(canvas(page).getByRole('option', { name: /^Text box: Nucleus/ })).toHaveCount(1);

  // Speaker notes for slide 4.
  await page.getByRole('textbox', { name: 'Speaker notes for slide 4' }).click();
  await page.keyboard.type('Ask for questions');

  // Reorder: Alt+↑ moves slide 4 up; dragging slide 1 below slide 2 moves it down.
  await slideOption(page, 3).click();
  await page.keyboard.press('Alt+ArrowUp');
  await expect(slideOption(page, 2)).toHaveAccessibleName('Slide 3: Summary');
  const first = (await slideOption(page, 0).boundingBox())!;
  const second = (await slideOption(page, 1).boundingBox())!;
  await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2);
  await page.mouse.down();
  await page.mouse.move(second.x + second.width / 2, second.y + second.height * 0.8, { steps: 10 });
  await page.mouse.up();
  await expect.poll(() => labels(page)).toEqual(['Slide 1: Organelles', 'Slide 2: Cell biology', 'Slide 3: Summary', 'Slide 4: Membranes']);
  // The dragged slide (not selected before) is now the only selected slide, and the current one.
  await expect(slideOption(page, 1)).toHaveAttribute('aria-current', 'true');
  await expect(slides(page).locator('[role="option"][aria-selected="true"]')).toHaveCount(1);

  // Duplicate slide 2 from the slide menu, delete the copy, delete slide 4, then undo that.
  await slideOption(page, 1).click();
  await page.getByRole('button', { name: 'Slide actions' }).click();
  await page.getByRole('menuitem', { name: /^Duplicate slide/ }).click();
  await expect(slides(page).getByRole('option')).toHaveCount(5);
  await expect(slideOption(page, 2)).toHaveAccessibleName('Slide 3: Cell biology');
  await page.keyboard.press('Delete');
  await expect(slides(page).getByRole('option')).toHaveCount(4);
  await slideOption(page, 3).click();
  await page.keyboard.press('Delete');
  await expect(page.getByText(/Deleted slide 4\. Undo with/)).toBeVisible();
  await expect(slides(page).getByRole('option')).toHaveCount(3);
  await page.keyboard.press(`${M}+z`);
  await expect(slides(page).getByRole('option')).toHaveCount(4);
  await expect(slideOption(page, 3)).toHaveAccessibleName('Slide 4: Membranes');

  // Hide slide 3 from its menu.
  await slideOption(page, 2).click({ button: 'right' });
  await page.getByRole('menu', { name: 'Slide' }).getByRole('menuitem', { name: 'Hide slide' }).click();
  await expect(slideOption(page, 2)).toHaveAccessibleName('Slide 3: Summary (hidden in the slide show)');

  // Everything is kept across a reload.
  await waitSaved(page);
  const before = await stored(page, id);
  expect(before.slides.map((s) => plain(s.elements.find((e) => e.placeholderId === 'title')?.text))).toEqual(['Organelles', 'Cell biology', 'Summary', 'Membranes']);
  expect(before.slides[2].hidden).toBe(true);
  expect(plain(before.slides[2].notes)).toBe('Ask for questions');
  expect(before.slides[2].elements.filter((e) => plain(e.text) === 'Nucleus and mitochondria')).toHaveLength(1);
  await page.reload();
  await expect.poll(() => labels(page)).toEqual(['Slide 1: Organelles', 'Slide 2: Cell biology', 'Slide 3: Summary (hidden in the slide show)', 'Slide 4: Membranes']);
  await slideOption(page, 2).click();
  await expect(page.getByRole('textbox', { name: 'Speaker notes for slide 3' })).toHaveText('Ask for questions');
  await expect(canvas(page).getByRole('option', { name: /^Text box: Nucleus/ })).toHaveCount(1);
  expect(await stored(page, id)).toEqual(before);
});

test('formats a text box from the ribbon and undoes it', async ({ page }) => {
  const id = await createFromQuickStart(page, 'Blank presentation');
  await typeInto(page, /^Subtitle placeholder/, 'Week 3');
  await canvas(page).getByRole('option', { name: /^Subtitle placeholder/ }).click();
  await page.getByRole('button', { name: 'Italic' }).click();
  await page.getByRole('combobox', { name: 'Font size' }).selectOption('36');
  await waitSaved(page);
  await expect.poll(async () => (await stored(page, id)).slides[0].elements[1]).toMatchObject({ style: { italic: true, fontSize: 36 } });
  await page.getByRole('button', { name: 'Undo' }).click();
  await page.getByRole('button', { name: 'Undo' }).click();
  await waitSaved(page);
  await expect.poll(async () => (await stored(page, id)).slides[0].elements[1]).toMatchObject({ style: { italic: false, fontSize: 22 } });
  expect(plain((await stored(page, id)).slides[0].elements[1].text)).toBe('Week 3');
});

test("'Resize box to fit text' keeps all the text visible after a font size change and a narrower box", async ({ page }) => {
  const id = await createFromQuickStart(page, 'Blank presentation');
  await page.getByRole('tab', { name: 'Insert' }).click();
  await page.getByRole('button', { name: 'Text box' }).click();
  await expect(page.locator('[data-stage] .ProseMirror')).toBeFocused();
  await page.keyboard.type('A text box with a sentence long enough to wrap onto more than one line when narrow.');
  await page.keyboard.press('Escape');
  const box = canvas(page).getByRole('option', { name: /^Text box/ });
  /** The text box as drawn on the stage: how tall its text is and how tall the box shows it. */
  const drawn = async () =>
    page.evaluate((boxId) => {
      const el = document.querySelector(`[data-stage] [data-element="${boxId}"]`) as HTMLElement | null;
      const area = el?.firstElementChild as HTMLElement | null;
      return { text: area?.scrollHeight ?? -1, shown: area?.clientHeight ?? -2 };
    }, (await stored(page, id)).slides[0].elements.at(-1)!.id);
  await waitSaved(page);
  await expect.poll(async () => (await stored(page, id)).slides[0].elements.length).toBe(3);
  const h0 = (await stored(page, id)).slides[0].elements.at(-1)!.h;
  await page.getByRole('tab', { name: 'Home' }).click();
  await box.click();
  await page.getByRole('combobox', { name: 'Font size' }).selectOption('40');
  await waitSaved(page);
  await expect.poll(async () => (await stored(page, id)).slides[0].elements.at(-1)!.h).toBeGreaterThan(h0 * 2);
  await expect.poll(async () => { const d = await drawn(); return d.text <= d.shown + 1; }).toBe(true);
  // Narrower with the east handle: taller again, all the text still shown.
  const before = (await stored(page, id)).slides[0].elements.at(-1)!.h;
  const handle = (await page.locator('[data-handle="e"]').boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 - 150, handle.y + handle.height / 2 + 1, { steps: 8 });
  await page.mouse.up();
  await waitSaved(page);
  await expect.poll(async () => (await stored(page, id)).slides[0].elements.at(-1)!.h).toBeGreaterThan(before);
  await expect.poll(async () => { const d = await drawn(); return d.text <= d.shown + 1; }).toBe(true);
  // One undo takes back the narrowing and its fitted height together.
  await page.getByRole('button', { name: 'Undo' }).click();
  await waitSaved(page);
  await expect.poll(async () => (await stored(page, id)).slides[0].elements.at(-1)!.h).toBe(before);
});

test('Copy from the object menu or the ribbon is what Ctrl/⌘+V pastes, not older clipboard text', async ({ page, context, browserName }) => {
  // Older text on the system clipboard: Chromium lets the page write it once granted; elsewhere the clipboard is empty.
  const chromium = browserName === 'chromium';
  if (chromium) await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const stale = () => (chromium ? page.evaluate(() => navigator.clipboard.writeText('stale text from elsewhere')) : Promise.resolve());
  await createFromQuickStart(page, 'Blank presentation');
  const M = await mod(page);
  await typeInto(page, /^Title placeholder/, 'Alpha');
  await stale();
  const title = canvas(page).getByRole('option', { name: /^Title placeholder/ });
  await title.click();
  await title.click({ button: 'right' });
  await page.getByRole('menu', { name: 'Object' }).getByRole('menuitem', { name: /^Copy/ }).click();
  await canvas(page).focus();
  await page.keyboard.press(`${M}+v`);
  await expect(canvas(page).getByRole('option', { name: /^Text box: Alpha/ })).toHaveCount(1);
  await expect(canvas(page).getByRole('option', { name: /stale text/ })).toHaveCount(0);
  // The ribbon's Copy, after other text reached the clipboard again (the pasted copy, on top of the title, undone first).
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(canvas(page).getByRole('option', { name: /^Text box: Alpha/ })).toHaveCount(0);
  await stale();
  await title.click();
  await page.getByRole('toolbar', { name: 'Home' }).getByRole('button', { name: 'Copy' }).click();
  await canvas(page).focus();
  await page.keyboard.press(`${M}+v`);
  await expect(canvas(page).getByRole('option', { name: /^Text box: Alpha/ })).toHaveCount(1);
  await expect(canvas(page).getByRole('option', { name: /stale text/ })).toHaveCount(0);
});

test.describe('at phone width', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the slide strip, stage and notes are usable with no sideways scrolling', async ({ page }) => {
    await createFromQuickStart(page, 'Blank presentation');
    await expect(slides(page)).toHaveAttribute('aria-orientation', 'horizontal');
    await page.getByRole('button', { name: 'New slide', exact: true }).first().click();
    await expect(slides(page).getByRole('option')).toHaveCount(2);
    await typeInto(page, /^Title placeholder/, 'On a phone');
    await expect(slideOption(page, 1)).toHaveAccessibleName('Slide 2: On a phone');
    // The stage fits the width of the screen.
    const stage = (await page.locator('[data-stage]').boundingBox())!;
    expect(stage.x).toBeGreaterThanOrEqual(0);
    expect(stage.x + stage.width).toBeLessThanOrEqual(390);
    expect(stage.height).toBeGreaterThan(150);
    await expect(page.getByRole('textbox', { name: 'Speaker notes for slide 2' })).toBeVisible();
    // Reorder from the slide menu (touch screens have no drag here).
    await page.getByRole('button', { name: 'Slide actions' }).click();
    await page.getByRole('menuitem', { name: /^Move up/ }).click();
    await expect(slideOption(page, 0)).toHaveAccessibleName('Slide 1: On a phone');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
