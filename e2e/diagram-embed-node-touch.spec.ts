import { expect, test, type Locator, type Page } from '@playwright/test';
import { createFromQuickStart, readStore, waitSaved } from './helpers';

// Phase 6 (NODE): an embedded diagram at phone width, by touch. Runs on mobile-chromium (Pixel 7, as every *-touch
// spec) and, with touch switched on below, on chromium and webkit too. Firefox has no touch emulation.
test.skip(({ browserName }) => browserName === 'firefox', 'no touch emulation in Firefox');
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

type DiagramAttrs = { previewId: string; width: number; height: number; naturalWidth: number; naturalHeight: number; title: string };
type StoredDoc = { id: string; content: { doc: unknown } };

function findDiagrams(node: unknown, out: DiagramAttrs[] = []): DiagramAttrs[] {
  const n = node as { type?: string; attrs?: DiagramAttrs; content?: unknown[] };
  if (n.type === 'diagram' && n.attrs) out.push(n.attrs);
  n.content?.forEach((c) => findDiagrams(c, out));
  return out;
}
async function storedDiagrams(page: Page, id: string) {
  const doc = (await readStore<StoredDoc>(page, 'documents')).find((d) => d.id === id)!;
  return findDiagrams(doc.content.doc);
}
const noSideScroll = (page: Page) => expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
const rect = async (l: Locator) => (await l.boundingBox())!;

async function insertFlowchart(page: Page) {
  await page.locator('.ProseMirror').getByText('Begin your answer here.', { exact: false }).tap();
  await page.getByRole('tab', { name: 'Diagram' }).tap();
  await page.getByRole('button', { name: /new diagram/i }).tap();
  await page.getByRole('menuitem', { name: 'Flowchart', exact: true }).tap();
  const dialog = page.getByRole('dialog', { name: 'New diagram' });
  await expect(dialog.locator('.react-flow__node').first()).toBeVisible();
  await dialog.getByRole('button', { name: 'Insert into document' }).tap();
  await expect(dialog).toBeHidden();
  const box = page.locator('.ProseMirror .dcos-diagram-box');
  await expect(box.locator('img')).toBeVisible();
  return box;
}

test('at phone width a diagram keeps its proportions, a tap selects it and a double-tap opens it for editing', async ({ page }) => {
  const id = await createFromQuickStart(page, 'Assignment');
  const box = await insertFlowchart(page);
  await waitSaved(page);
  const [d] = await storedDiagrams(page, id);

  // Sized by width + aspect ratio: narrower than stored on a phone, and never letterboxed.
  const b = await rect(box);
  const img = await rect(box.locator('img'));
  expect(b.width).toBeLessThan(d.width);
  expect(Math.abs(b.height / b.width - d.naturalHeight / d.naturalWidth)).toBeLessThan(0.01);
  expect(Math.abs(img.width - b.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(img.height - b.height)).toBeLessThanOrEqual(1);
  await noSideScroll(page);

  // A tap selects it (the Selected diagram bar appears); a double-tap opens the editor.
  await box.tap();
  await expect(page.locator('.ProseMirror .dcos-diagram.is-selected')).toHaveCount(1);
  await expect(page.getByRole('toolbar', { name: 'Selected diagram' })).toBeVisible();
  const c = await rect(box);
  await page.touchscreen.tap(c.x + c.width / 2, c.y + c.height / 2);
  await page.touchscreen.tap(c.x + c.width / 2 + 2, c.y + c.height / 2 + 2);
  const dialog = page.getByRole('dialog', { name: 'Edit diagram' });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await dialog.getByRole('button', { name: 'Save changes' }).tap();
  await expect(dialog).toBeHidden();
  await waitSaved(page);
  const [after] = await storedDiagrams(page, id);
  expect(Math.abs(after.height / after.width - after.naturalHeight / after.naturalWidth)).toBeLessThan(0.01);
  expect(after.width).toBe(d.width);
  // Still selected afterwards, so the next tap or key acts on it.
  await expect(page.locator('.ProseMirror .dcos-diagram.is-selected')).toHaveCount(1);

  // The ribbon's Edit button can be reached and tapped on a phone too.
  await page.getByRole('tab', { name: 'Diagram' }).tap();
  const edit = page.getByRole('toolbar', { name: 'Diagram' }).getByRole('button', { name: 'Edit', exact: true });
  await edit.scrollIntoViewIfNeeded();
  await edit.tap();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).tap();
  await expect(dialog).toBeHidden();
  await noSideScroll(page);
});

test('resizing by the handle starts from the width shown, keeps the proportions, and a cancelled drag changes nothing', async ({ page }) => {
  const id = await createFromQuickStart(page, 'Assignment');
  const box = await insertFlowchart(page);
  await waitSaved(page);
  const [d] = await storedDiagrams(page, id);
  await box.tap();
  const handle = page.locator('.ProseMirror .dcos-diagram-handle');
  await expect(handle).toBeVisible();
  // Away from the bottom of the screen, where the "Diagram added" message is shown for a while.
  await box.evaluate((el) => el.scrollIntoView({ block: 'center' }));

  // The handle can be hit well outside the small square it draws: at least 24 px across and down (measured on the
  // page, so anything that clips it counts).
  const h = await rect(handle);
  const reach = await page.evaluate(
    ({ x, y }) => {
      const hits = (dx: number, dy: number) => !!document.elementFromPoint(x + dx, y + dy)?.classList.contains('dcos-diagram-handle');
      const span = (horizontal: boolean) => {
        let n = 0;
        for (let d = -40; d <= 40; d++) if (horizontal ? hits(d, 0) : hits(0, d)) n++;
        return n;
      };
      return [span(true), span(false)];
    },
    { x: h.x + h.width / 2, y: h.y + h.height / 2 },
  );
  expect(reach[0]).toBeGreaterThanOrEqual(24);
  expect(reach[1]).toBeGreaterThanOrEqual(24);
  expect(await handle.evaluate((el) => getComputedStyle(el).touchAction)).toBe('none');

  // A drag the browser cancels (pointercancel, e.g. a system gesture) leaves the diagram as it was, and the next
  // tap elsewhere does not resize it either.
  const before = await rect(box);
  const cx = h.x + h.width / 2;
  const cy = h.y + h.height / 2;
  await handle.dispatchEvent('pointerdown', { pointerId: 41, pointerType: 'touch', isPrimary: true, button: 0, buttons: 1, clientX: cx, clientY: cy });
  await page.evaluate(({ x, y }) => window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 41, pointerType: 'touch', clientX: x - 120, clientY: y })), { x: cx, y: cy });
  await expect.poll(async () => Math.round((await rect(box)).width)).toBe(Math.round(before.width - 120));
  await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 41, pointerType: 'touch' })));
  await expect.poll(async () => Math.round((await rect(box)).width)).toBe(Math.round(before.width));
  await page.locator('.ProseMirror').getByText('Begin your answer here.', { exact: false }).tap();
  await page.evaluate(({ x, y }) => window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 41, pointerType: 'touch', clientX: x - 200, clientY: y })), { x: cx, y: cy });
  expect(Math.round((await rect(box)).width)).toBe(Math.round(before.width));
  expect((await storedDiagrams(page, id))[0].width).toBe(d.width);

  // A real drag 96 px to the left: from the width on screen (not the larger stored width), proportions kept.
  await box.tap();
  await expect(handle).toBeVisible();
  const h2 = await rect(handle);
  await page.mouse.move(h2.x + h2.width / 2, h2.y + h2.height / 2);
  await page.mouse.down();
  await page.mouse.move(h2.x + h2.width / 2 - 48, h2.y + h2.height / 2, { steps: 4 });
  await page.mouse.move(h2.x + h2.width / 2 - 96, h2.y + h2.height / 2, { steps: 4 });
  await page.mouse.up();
  await expect.poll(async () => (await storedDiagrams(page, id))[0].width).toBe(Math.round(before.width - 96));
  const [resized] = await storedDiagrams(page, id);
  expect(Math.abs(resized.height / resized.width - resized.naturalHeight / resized.naturalWidth)).toBeLessThan(0.01);
  const shown = await rect(box);
  expect(Math.abs(shown.width - (before.width - 96))).toBeLessThanOrEqual(2);
  expect(Math.abs(shown.height / shown.width - d.naturalHeight / d.naturalWidth)).toBeLessThan(0.01);
});
