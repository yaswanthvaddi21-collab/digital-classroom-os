import { expect, test, type Page } from '@playwright/test';
import { createFromQuickStart, readStore, waitSaved } from './helpers';

/**
 * Presentation Studio design (Phase 7 Round 2b, DESIGN) in a real browser: a template from quick start and from the
 * New dialog, themes, slide size, backgrounds (gradient and picture), changing a slide's layout with its text kept,
 * and master view, whose changes reach the slides. A reload keeps everything. Then master view at phone width.
 */

type Text = { type: 'text'; text: string };
type Doc = { type: 'doc'; content: Array<{ type: string; content?: Array<Text | Doc['content'][number]> }> };
type El = { id: string; type: string; x: number; y: number; w: number; h: number; placeholderId?: string; text?: Doc; style?: { fontSize: number } };
type Bg = { type: string; attachmentId?: string; angle?: number };
type Content = {
  themeId: string;
  size: { width: number; height: number };
  masters: Array<{ background: Bg; decorations: El[]; placeholders: Array<{ id: string; style: { fontSize: number } }> }>;
  layouts: Array<{ id: string; placeholders: Array<{ id: string; style: { fontSize: number } }> }>;
  slides: Array<{ id: string; layoutId: string; elements: El[]; background?: Bg }>;
};
type Item = { id: string; title: string; content: Content };

const plain = (doc: Doc | undefined): string =>
  (doc?.content ?? [])
    .map((b) => JSON.stringify(b).match(/"text":"([^"]*)"/g)?.map((m) => m.slice(8, -1)).join('') ?? '')
    .join('\n');

async function stored(page: Page, id: string): Promise<Content> {
  const items = await readStore<Item>(page, 'presentations');
  return items.find((i) => i.id === id)!.content;
}

/** A 1×1 PNG. */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

const slides = (page: Page) => page.getByRole('listbox', { name: 'Slides' });
const slideOption = (page: Page, n: number) => slides(page).getByRole('option').nth(n);
const design = (page: Page) => page.getByRole('toolbar', { name: 'Design' });
const dialogTitled = (page: Page, title: string) => page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: title }) });

test('templates, themes, size, backgrounds, layouts and master view, kept after a reload', async ({ page }) => {
  const id = await createFromQuickStart(page, 'Lecture slides');
  await expect(slides(page).getByRole('option')).toHaveCount(6);
  await expect(slideOption(page, 1)).toHaveAccessibleName('Slide 2: Learning objectives');
  await waitSaved(page);
  expect((await stored(page, id)).masters[0].decorations).toHaveLength(2);

  // Theme from the gallery.
  await page.getByRole('tab', { name: 'Design' }).click();
  await design(page).getByRole('button', { name: 'Themes' }).click();
  await page.getByRole('radio', { name: 'Midnight theme' }).click();
  await expect(design(page).getByRole('button', { name: 'Themes' })).toContainText('Midnight');
  await waitSaved(page);
  await expect.poll(async () => (await stored(page, id)).themeId).toBe('midnight');

  // Slide 2: a gradient background, then a picture background stored as an attachment.
  await slideOption(page, 1).click();
  await design(page).getByRole('button', { name: 'Format background' }).click();
  const bg = dialogTitled(page, 'Format background');
  await bg.getByRole('radio', { name: 'Gradient' }).click();
  await bg.getByRole('button', { name: 'Warm gradient' }).click();
  await expect(page.locator('[data-stage] > [data-slide] > div').first()).toHaveCSS('background-image', /linear-gradient/);
  await waitSaved(page);
  await expect.poll(async () => (await stored(page, id)).slides[1].background?.type).toBe('gradient');
  await bg.getByLabel('Background picture file').setInputFiles({ name: 'sky.png', mimeType: 'image/png', buffer: PNG });
  await expect.poll(async () => (await stored(page, id)).slides[1].background?.type).toBe('image');
  const pictureId = (await stored(page, id)).slides[1].background!.attachmentId!;
  expect((await readStore<{ id: string }>(page, 'attachments')).some((a) => a.id === pictureId)).toBe(true);
  await expect(page.locator('[data-stage] > [data-slide] > div').first()).toHaveCSS('background-image', /url\("blob:/);
  await bg.getByRole('button', { name: 'Done' }).click();

  // Slide 2 to "Two content": its bullets move into the left column.
  await design(page).getByRole('button', { name: 'Layout', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Two content' }).click();
  await waitSaved(page);
  await expect
    .poll(async () => {
      const s = (await stored(page, id)).slides[1];
      return [s.layoutId, plain(s.elements.find((e) => e.placeholderId === 'left')?.text)];
    })
    .toEqual(['layout-twoContent', expect.stringContaining('Explain the key idea')]);

  // Master view: the master's title size reaches every slide whose title follows it.
  await design(page).getByRole('button', { name: 'Edit the slide master and layouts' }).click();
  const targets = page.getByRole('listbox', { name: 'Slide master and layouts' });
  await expect(targets.getByRole('option', { selected: true })).toHaveAccessibleName('Two content layout, used by 2 slides');
  await targets.getByRole('option', { name: /^Slide master/ }).click();
  const objects = page.getByRole('listbox', { name: 'Objects on the slide master' });
  await objects.getByRole('option', { name: /^Title placeholder/ }).click();
  await page.getByRole('toolbar', { name: 'Slide Master' }).getByRole('combobox', { name: 'Font size' }).selectOption('40');
  await page.getByRole('toolbar', { name: 'Slide Master' }).getByRole('button', { name: 'Rectangle' }).click();
  await waitSaved(page);
  await expect
    .poll(async () => {
      const c = await stored(page, id);
      return [c.masters[0].placeholders[0].style.fontSize, c.masters[0].decorations.length, c.slides[4].elements.find((e) => e.placeholderId === 'title')?.style?.fontSize];
    })
    .toEqual([40, 3, 40]);
  await page.getByRole('button', { name: 'Close master view' }).click();
  await expect(slides(page).getByRole('option')).toHaveCount(6);

  // Slide size 4:3: the stage changes shape.
  await design(page).getByRole('combobox', { name: 'Slide size' }).selectOption('4:3');
  await expect.poll(async () => {
    const b = (await page.locator('[data-stage]').boundingBox())!;
    return Math.round((b.width / b.height) * 100) / 100;
  }).toBe(1.33);
  await waitSaved(page);
  await expect.poll(async () => (await stored(page, id)).size.height).toBe(720);

  // A reload keeps every change.
  const before = await stored(page, id);
  await page.reload();
  await expect(slides(page).getByRole('option')).toHaveCount(6);
  expect(await stored(page, id)).toEqual(before);
  await page.getByRole('tab', { name: 'Design' }).click();
  await expect(design(page).getByRole('button', { name: 'Themes' })).toContainText('Midnight');
  await expect(design(page).getByRole('combobox', { name: 'Slide size' })).toHaveValue('4:3');
});

test('the New dialog lists the presentation templates and creates from them', async ({ page }) => {
  await page.goto('./#/');
  await page.getByRole('button', { name: 'New presentation' }).click();
  const dialog = page.getByRole('dialog');
  for (const name of ['Blank presentation', 'Lecture', 'Project presentation', 'Lab results', 'Class report']) await expect(dialog.getByRole('button', { name: new RegExp(`^${name}`) })).toBeVisible();
  await dialog.getByRole('button', { name: /^Lab results/ }).click();
  await expect(page).toHaveURL(/#\/presentations\/[0-9a-f-]{36}$/);
  const id = page.url().split('/').pop()!;
  await expect(slides(page).getByRole('option')).toHaveCount(6);
  await waitSaved(page);
  const items = await readStore<Item>(page, 'presentations');
  const item = items.find((i) => i.id === id)!;
  expect(item.title).toBe('Lab results');
  expect(item.content.themeId).toBe('midnight');
  expect(item.content.slides[3].elements.some((e) => e.type === 'table')).toBe(true);
});

test.describe('at phone width', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the Design tab and master view are usable with no sideways scrolling', async ({ page }) => {
    const id = await createFromQuickStart(page, 'Blank presentation');
    await page.getByRole('tab', { name: 'Design' }).click();
    await design(page).getByRole('button', { name: 'Edit the slide master and layouts' }).click();
    const targets = page.getByRole('listbox', { name: 'Slide master and layouts' });
    await expect(targets).toHaveAttribute('aria-orientation', 'horizontal');
    await page.getByRole('listbox', { name: /^Objects on the Title slide layout/ }).getByRole('option', { name: /^Subtitle placeholder/ }).click();
    await page.getByRole('toolbar', { name: 'Slide Master' }).getByRole('button', { name: 'Bold' }).click();
    const stage = (await page.locator('[data-stage]').boundingBox())!;
    expect(stage.x).toBeGreaterThanOrEqual(0);
    expect(stage.x + stage.width).toBeLessThanOrEqual(390);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await waitSaved(page);
    await expect.poll(async () => ((await stored(page, id)).slides[0].elements.find((e) => e.placeholderId === 'subtitle') as { style?: { bold?: boolean } }).style?.bold).toBe(true);
    await page.getByRole('button', { name: 'Close master view' }).click();
    await expect(slides(page)).toBeVisible();
  });
});
