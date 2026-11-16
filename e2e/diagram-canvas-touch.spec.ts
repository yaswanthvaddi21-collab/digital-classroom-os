import { expect, test, type Page } from './fixtures';
import { readStore } from './helpers';

/**
 * Phase 5 G-CANVAS on a touch screen (phone profile): a long press adds a shape to the selection or takes it out, and
 * "Select several" turns taps into add/remove. Needs the mobile-chromium project (its testMatch must include this file).
 */

const style = { fill: '#ffffff', stroke: '#334155', strokeWidth: 2, textColor: '#0f172a', fontSize: 14, dashed: false, bold: false };
const n = (id: string, x: number, y: number) => ({ id, position: { x, y }, width: 120, height: 60, data: { ...style, shape: 'rectangle', label: id.toUpperCase() } });
type Stored = { id: string; content: { nodes: Array<{ id: string; parentId?: string; data: { shape: string } }> } };

async function open(page: Page, content: unknown) {
  await page.goto('./#/diagrams');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Import diagram file' }).click()]);
  await chooser.setFiles({ name: 'Touch.dcosdiagram', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ format: 'dcos-diagram', version: 1, app: 'test', title: 'Touch', diagram: content })) });
  await expect(page).toHaveURL(/#\/diagrams\/[0-9a-f-]{36}$/);
  await expect(page.locator('.react-flow__node')).toHaveCount(3);
  return page.url().split('/').pop()!;
}
const node = (page: Page, id: string) => page.locator(`.react-flow__node[data-id="${id}"]`);
const selected = (page: Page) => page.locator('.react-flow__node.selected').evaluateAll((els) => els.map((e) => e.getAttribute('data-id')).sort());

test('long press and "Select several" build a selection by touch, which can then be grouped', async ({ page, isMobile, browserName }) => {
  test.skip(!isMobile || browserName !== 'chromium', 'touch profile (Chromium touch events)');
  const id = await open(page, { schemaVersion: 2, nodes: [n('a', 0, 0), n('b', 0, 110), n('c', 0, 220)], edges: [], viewport: { x: 30, y: 30, zoom: 1 }, settings: { snapToGrid: true, showGrid: true, autoLayout: 'none' } });
  const cdp = await page.context().newCDPSession(page);
  const longPress = async (target: string) => {
    const b = (await node(page, target).boundingBox())!;
    const point = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
    await page.waitForTimeout(750);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };

  await node(page, 'a').tap();
  expect(await selected(page)).toEqual(['a']);
  await longPress('b');
  await expect.poll(() => selected(page)).toEqual(['a', 'b']);
  await longPress('a');
  await expect.poll(() => selected(page)).toEqual(['b']);

  await page.getByRole('button', { name: /^Select several/ }).tap();
  await expect(page.getByRole('button', { name: /^Select several: on/ })).toHaveAttribute('aria-pressed', 'true');
  await node(page, 'a').tap();
  await node(page, 'c').tap();
  await expect.poll(() => selected(page)).toEqual(['a', 'b', 'c']);
  await node(page, 'c').tap();
  await expect.poll(() => selected(page)).toEqual(['a', 'b']);

  await page.getByRole('button', { name: 'Group (Ctrl+G)' }).tap();
  await expect
    .poll(async () => {
      const d = (await readStore<Stored>(page, 'diagrams')).find((x) => x.id === id)!;
      const g = d.content.nodes.find((x) => x.data.shape === 'group');
      return g ? d.content.nodes.filter((x) => x.parentId === g.id).map((x) => x.id) : [];
    }, { timeout: 10_000 })
    .toEqual(['a', 'b']);
  await page.getByRole('button', { name: /^Select several: on/ }).tap();
  await expect(page.getByRole('button', { name: /^Select several \(/ })).toHaveAttribute('aria-pressed', 'false');
});
