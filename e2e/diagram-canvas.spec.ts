import { expect, test, type Page } from './fixtures';
import { downloadBytes, readStore } from './helpers';

/** Phase 5 G-CANVAS in the real app: groups, locks, layers, order, distribute, select all, clipboard, zoom, help, full screen. */

type StoredNode = { id: string; position: { x: number; y: number }; width: number; height: number; parentId?: string; locked?: boolean; layer?: string; data: Record<string, unknown> & { label: string; shape: string } };
type Stored = { id: string; content: { schemaVersion: number; nodes: StoredNode[]; edges: Array<{ id: string }>; layers?: Array<{ id: string; name: string; visible: boolean }> } };

const style = { fill: '#ffffff', stroke: '#334155', strokeWidth: 2, textColor: '#0f172a', fontSize: 14, dashed: false, bold: false };
const n = (id: string, x: number, y: number, extra: Record<string, unknown> = {}) => ({ id, position: { x, y }, width: 140, height: 70, data: { ...style, shape: 'rectangle', label: id.toUpperCase() }, ...extra });
const connector = (id: string, source: string, target: string) => ({ id, source, target, sourceHandle: 'r', targetHandle: 'l', type: 'smoothstep', label: '', data: { color: '#475569', width: 2, dashed: false, arrow: 'end' } });
const diagram = (nodes: unknown[], edges: unknown[] = [], extra: Record<string, unknown> = {}) => ({ schemaVersion: 2, nodes, edges, viewport: { x: 40, y: 40, zoom: 1 }, settings: { snapToGrid: false, showGrid: true, autoLayout: 'none' }, ...extra });

/** Opens a diagram as a new item through the Diagrams list's file import (the .dcosdiagram format). */
async function open(page: Page, title: string, content: unknown) {
  await page.goto('./#/diagrams');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Import diagram file' }).click()]);
  await chooser.setFiles({ name: `${title}.dcosdiagram`, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ format: 'dcos-diagram', version: 1, app: 'test', title, diagram: content })) });
  await expect(page).toHaveURL(/#\/diagrams\/[0-9a-f-]{36}$/);
  await expect(page.locator('.react-flow__node').first()).toBeVisible();
  return page.url().split('/').pop()!;
}
const stored = async (page: Page, id: string) => (await readStore<Stored>(page, 'diagrams')).find((d) => d.id === id)!.content;
/** Polls the saved diagram until `check` passes. */
const saved = (page: Page, id: string) => ({ poll: <T>(pick: (c: Stored['content']) => T) => expect.poll(async () => pick(await stored(page, id)), { timeout: 10_000 }) });
const node = (page: Page, id: string) => page.locator(`.react-flow__node[data-id="${id}"]`);
const selectedIds = (page: Page) => page.locator('.react-flow__node.selected').evaluateAll((els) => els.map((e) => e.getAttribute('data-id')));
const centre = async (page: Page, id: string) => {
  const b = (await node(page, id).boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};

test('group with Ctrl+G: first click selects the group, second the shape; dragging a shape moves the group; ungroup restores', async ({ page }) => {
  const id = await open(page, 'Groups', diagram([n('a', 0, 0), n('b', 220, 120), n('c', 600, 0)], [connector('e1', 'a', 'b')]));
  await node(page, 'a').click();
  await node(page, 'b').click({ modifiers: ['Shift'] });
  await page.keyboard.press('ControlOrMeta+g');
  await saved(page, id).poll((c) => c.nodes.filter((x) => x.parentId).length).toBe(2);
  const g = (await stored(page, id)).nodes.find((x) => x.data.shape === 'group')!;
  expect(g).toMatchObject({ position: { x: 0, y: 0 }, width: 360, height: 190 });
  expect((await stored(page, id)).schemaVersion).toBe(3);

  // Clear, then click a shape inside: the group is selected; again: the shape.
  await page.locator('.react-flow__pane').click({ position: { x: 5, y: 5 } });
  await node(page, 'b').click();
  expect(await selectedIds(page)).toEqual([g.id]);
  await expect(page.getByRole('button', { name: 'Ungroup (Ctrl+Shift+G)' })).toBeVisible();

  // Dragging a shape of a selected-but-not-entered group moves the whole group.
  await page.locator('.react-flow__pane').click({ position: { x: 5, y: 5 } });
  const from = await centre(page, 'a');
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 100, from.y + 50, { steps: 8 });
  await page.mouse.up();
  // The group moved as far as the pointer did (in canvas units at the current zoom); its shapes rode along.
  const scale = await page.locator('.react-flow__viewport').evaluate((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).a);
  await saved(page, id).poll((c) => c.nodes.find((x) => x.id === g.id)!.position.x).toBeGreaterThan(20);
  const after = await stored(page, id);
  const moved = after.nodes.find((x) => x.id === g.id)!.position;
  expect(moved.x).toBeCloseTo(100 / scale, -1);
  expect(moved.y).toBeCloseTo(50 / scale, -1);
  expect(after.nodes.find((x) => x.id === 'a')!.position).toEqual({ x: 0, y: 0 });
  expect(after.nodes.find((x) => x.id === 'b')!.position).toEqual({ x: 220, y: 120 });

  // Second click enters the group.
  await node(page, 'b').click();
  await node(page, 'b').click();
  expect(await selectedIds(page)).toEqual(['b']);

  // Ungroup: the shapes stay where they are on the canvas and the group is gone.
  await page.locator('.react-flow__pane').click({ position: { x: 5, y: 5 } });
  await node(page, 'a').click();
  await page.keyboard.press('ControlOrMeta+Shift+g');
  await saved(page, id).poll((c) => c.nodes.map((x) => [x.id, x.position.x, x.position.y, x.parentId ?? null])).toEqual([
    ['a', moved.x, moved.y, null],
    ['b', moved.x + 220, moved.y + 120, null],
    ['c', 600, 0, null],
  ]);
  expect((await stored(page, id)).schemaVersion).toBe(2);
});

test('resizing a group scales the shapes in it', async ({ page }) => {
  const id = await open(page, 'Resize', diagram([n('a', 0, 0), n('b', 200, 100)]));
  await node(page, 'a').click();
  await node(page, 'b').click({ modifiers: ['Shift'] });
  await page.keyboard.press('ControlOrMeta+g');
  await saved(page, id).poll((c) => c.nodes.find((x) => x.data.shape === 'group')?.width).toBe(340);
  const g = (await stored(page, id)).nodes.find((x) => x.data.shape === 'group')!;
  const scale = await page.locator('.react-flow__viewport').evaluate((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).a);
  const handle = node(page, g.id).locator('.react-flow__resize-control.handle.bottom.right');
  const h = (await handle.boundingBox())!;
  // The handle's outer half: the inner half lies under shape b, which sits in the group's corner.
  const at = { x: h.x + h.width - 2, y: h.y + h.height - 2 };
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.mouse.move(at.x + 340 * scale, at.y + 170 * scale, { steps: 10 });
  await page.mouse.up();
  await saved(page, id).poll((c) => Math.round(c.nodes.find((x) => x.id === g.id)!.width / 10)).toBe(68);
  const c = await stored(page, id);
  const b = c.nodes.find((x) => x.id === 'b')!;
  // Twice the size: b's place in the group and its size double too.
  expect(b.position.x).toBeCloseTo(400, -1);
  expect(b.position.y).toBeCloseTo(200, -1);
  expect(b.width).toBeCloseTo(280, -1);
  expect(b.height).toBeCloseTo(140, -1);
});

test('lock: the badge shows, the shape does not move or delete, and Unlock in the Format panel frees it', async ({ page }) => {
  const id = await open(page, 'Locks', diagram([n('a', 0, 0), n('b', 300, 0)]));
  await node(page, 'a').click();
  await page.getByRole('button', { name: 'Lock (Ctrl+L)' }).click();
  await expect(node(page, 'a')).toHaveClass(/dcos-locked/);
  await expect(node(page, 'a').locator('.react-flow__resize-control').first()).toBeHidden();
  await saved(page, id).poll((c) => c.nodes[0].locked).toBe(true);

  const from = await centre(page, 'a');
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 120, from.y + 80, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.press('Delete');
  await page.keyboard.press('ArrowRight');
  await node(page, 'a').dblclick();
  await expect(page.getByRole('textbox', { name: 'Shape text' })).toHaveCount(0);
  const c = await stored(page, id);
  expect(c.nodes.map((x) => [x.id, x.position.x, x.position.y])).toEqual([
    ['a', 0, 0],
    ['b', 300, 0],
  ]);

  const format = page.getByRole('complementary', { name: 'Format' });
  await expect(format.getByText('Locked shape', { exact: true })).toBeVisible();
  await format.getByRole('button', { name: 'Unlock' }).click();
  await saved(page, id).poll((x) => x.nodes[0].locked ?? false).toBe(false);
  await saved(page, id).poll((x) => x.schemaVersion).toBe(2);
});

test('layers: add, hide (not drawn, not exported, with a note), lock, current layer for new shapes', async ({ page }) => {
  const label = (text: string) => ({ data: { ...style, shape: 'rectangle', label: text } });
  const id = await open(page, 'Layers', diagram([n('a', 0, 0, label('Alphalabel')), n('b', 300, 0, label('Betalabel'))], [connector('e1', 'a', 'b')]));
  await page.getByRole('button', { name: 'Layers' }).click();
  const panel = page.getByRole('region', { name: 'Layers' });
  await panel.getByRole('button', { name: 'Add layer' }).click();
  await saved(page, id).poll((c) => c.layers?.map((l) => l.name)).toEqual(['Layer 1', 'Layer 2']);

  // Move b to Layer 2, then hide Layer 2.
  await node(page, 'b').click();
  await panel.getByRole('button', { name: 'More for Layer 2' }).click();
  await page.getByRole('menuitem', { name: 'Move selection here' }).click();
  await panel.getByRole('button', { name: 'Hide Layer 2' }).click();
  await expect(node(page, 'b')).toHaveCount(0);
  await expect(page.locator('.react-flow__edge')).toHaveCount(0);
  await saved(page, id).poll((c) => c.layers?.[1].visible).toBe(false);

  await page.getByRole('button', { name: 'Export' }).click();
  const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: /^SVG/ }).click()]);
  const svg = (await downloadBytes(file)).toString('utf8');
  expect(svg).toContain('Alphalabel');
  expect(svg).not.toContain('Betalabel');
  await expect(page.getByText(/hidden layer/)).toBeVisible();

  // Locked layer: its shapes cannot be selected.
  await panel.getByRole('button', { name: 'Show Layer 2' }).click();
  await panel.getByRole('button', { name: 'Lock Layer 1' }).click();
  await panel.getByRole('button', { name: 'Close layers' }).click();
  // Shapes on a locked layer take no pointer events: a click lands on the canvas behind them.
  await node(page, 'a').click({ force: true });
  await expect(node(page, 'a')).not.toHaveClass(/selected/);
  await page.getByRole('button', { name: 'Layers' }).click();
  await panel.getByRole('button', { name: 'Unlock Layer 1' }).click();

  // New shapes go to the current layer.
  await panel.getByRole('button', { name: /^Layer 2/ }).click();
  await page.getByRole('complementary', { name: 'Shapes' }).getByRole('button', { name: 'Circle', exact: true }).click();
  await page.keyboard.press('Escape');
  const c = await stored(page, id);
  await saved(page, id).poll((x) => x.nodes.find((m) => m.data.shape === 'circle')?.layer).toBe(c.layers![1].id);

  // Reload keeps layers.
  await page.reload();
  await page.getByRole('button', { name: 'Layers' }).click();
  await expect(page.getByRole('region', { name: 'Layers' }).getByRole('button', { name: /^Layer 2/ })).toBeVisible();
});

test('order: Bring to front paints the shape over the one it overlaps', async ({ page }) => {
  await open(page, 'Order', diagram([n('back', 0, 0, { data: { ...style, shape: 'rectangle', label: 'Back', fill: '#fee2e2' } }), n('front', 60, 30, { data: { ...style, shape: 'rectangle', label: 'Front', fill: '#dcfce7' } })]));
  const overlap = async () => {
    const b = (await node(page, 'front').boundingBox())!;
    return page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('.react-flow__node')?.getAttribute('data-id'), [b.x + 20, b.y + 20]);
  };
  await page.locator('.react-flow__pane').click({ position: { x: 5, y: 5 } });
  expect(await overlap()).toBe('front');
  await node(page, 'back').click({ position: { x: 10, y: 10 } });
  await page.getByRole('button', { name: 'Order' }).click();
  await page.getByRole('menuitem', { name: /Bring to front/ }).click();
  await page.locator('.react-flow__pane').click({ position: { x: 5, y: 5 } });
  await expect.poll(overlap).toBe('back');
  await node(page, 'back').click({ position: { x: 10, y: 10 } });
  await page.keyboard.press('ControlOrMeta+Shift+BracketLeft');
  await page.locator('.react-flow__pane').click({ position: { x: 5, y: 5 } });
  await expect.poll(overlap).toBe('front');
});

test('Ctrl+A selects shapes and connectors; distribute spaces three shapes evenly', async ({ page }) => {
  const id = await open(page, 'Distribute', diagram([n('a', 0, 0), n('b', 160, 0), n('c', 800, 0)], [connector('e1', 'a', 'b'), connector('e2', 'b', 'c')]));
  await node(page, 'a').click();
  await page.keyboard.press('ControlOrMeta+a');
  await expect(page.locator('.react-flow__node.selected')).toHaveCount(3);
  await expect(page.locator('.react-flow__edge.selected')).toHaveCount(2);
  await page.getByRole('button', { name: 'Distribute horizontally' }).click();
  await saved(page, id).poll((c) => c.nodes.map((x) => x.position.x)).toEqual([0, 400, 800]);
});

test('zoom shortcuts, fit, the shortcut help and full screen', async ({ page }) => {
  await open(page, 'View', diagram([n('a', 0, 0), n('b', 300, 0)]));
  const zoom = () => page.locator('.react-flow__viewport').evaluate((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).a);
  await node(page, 'a').click();
  expect(await zoom()).toBeCloseTo(1);
  await page.keyboard.press('ControlOrMeta+Equal');
  await expect.poll(zoom).toBeGreaterThan(1.1);
  await page.keyboard.press('ControlOrMeta+Minus');
  await expect.poll(zoom).toBeLessThan(1.05);
  await page.keyboard.press('ControlOrMeta+Minus');
  await expect.poll(zoom).toBeLessThan(0.9);
  await page.keyboard.press('ControlOrMeta+0');
  await expect.poll(zoom).toBeCloseTo(1, 2);
  await page.keyboard.press('Shift+Digit1');
  await expect.poll(zoom).toBeCloseTo(1.2, 2); // fit, capped at 1.2

  await page.keyboard.press('Shift+Slash'); // ?
  const help = page.getByRole('dialog').filter({ hasText: 'Keyboard shortcuts' });
  await expect(help).toBeVisible();
  for (const text of ['Group the selected shapes', 'Bring to front', 'Zoom in', 'Cut the selected shapes', 'Select all shapes and connectors', 'Full screen on or off']) await expect(help.getByText(text)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(help).toBeHidden();

  const fs = page.getByRole('button', { name: 'Full screen (Ctrl+Shift+F)' });
  await expect(fs).toBeVisible();
  await fs.click();
  await expect.poll(() => page.evaluate(() => (document.fullscreenElement ?? (document as unknown as { webkitFullscreenElement?: Element }).webkitFullscreenElement)?.className ?? '')).toContain('dcos-canvas-root');
  await page.getByRole('button', { name: 'Exit full screen (Ctrl+Shift+F)' }).click();
  await expect.poll(() => page.evaluate(() => !!(document.fullscreenElement ?? (document as unknown as { webkitFullscreenElement?: Element }).webkitFullscreenElement))).toBe(false);
});

test('link, tooltip and properties in the Format panel are saved and survive a reload', async ({ page }) => {
  const id = await open(page, 'Fields', diagram([n('a', 0, 0)]));
  await node(page, 'a').click();
  const format = page.getByRole('complementary', { name: 'Format' });
  await format.getByRole('textbox', { name: 'Link' }).fill('javascript:alert(1)');
  await expect(format.getByRole('alert')).toContainText('Only web');
  await format.getByRole('textbox', { name: 'Link' }).fill('https://example.com/a');
  await format.getByRole('textbox', { name: 'Tooltip' }).fill('Hello there');
  await format.getByRole('textbox', { name: 'New property name' }).fill('room');
  await format.getByRole('textbox', { name: 'New property value' }).fill('B12');
  // The whole row fits in the panel: no sideways scrolling to reach the Add button, and the value field is usable.
  const panel = (await format.boundingBox())!;
  const add = (await format.getByRole('button', { name: 'Add property' }).boundingBox())!;
  expect(add.x + add.width).toBeLessThanOrEqual(panel.x + panel.width);
  expect((await format.getByRole('textbox', { name: 'New property value' }).boundingBox())!.width).toBeGreaterThan(60);
  expect(await format.evaluate((el) => el.scrollWidth - el.clientWidth)).toBe(0);
  await format.getByRole('button', { name: 'Add property' }).click();
  await saved(page, id).poll((c) => c.nodes[0].data).toMatchObject({ link: 'https://example.com/a', tooltip: 'Hello there', properties: { room: 'B12' } });
  await page.reload();
  await expect(node(page, 'a')).toHaveAttribute('title', 'Hello there');
  await node(page, 'a').click();
  await expect(page.getByRole('complementary', { name: 'Format' }).getByRole('link', { name: /Open link/ })).toHaveAttribute('href', 'https://example.com/a');
});

test('copy in one tab and paste in another (system clipboard); cut removes the shape', async ({ page, context, browserName }) => {
  if (browserName === 'chromium') await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await open(page, 'Source', diagram([n('a', 0, 0, { data: { ...style, shape: 'ellipse', label: 'From tab one', link: 'https://example.com' } }), n('b', 300, 0)]));
  await node(page, 'a').click();
  await page.keyboard.press('ControlOrMeta+c');

  const other = await context.newPage();
  const targetId = await open(other, 'Target', diagram([n('x', 0, 0)]));
  await node(other, 'x').click();
  await other.keyboard.press('ControlOrMeta+v');
  await expect(other.locator('.react-flow__node', { hasText: 'From tab one' })).toBeVisible();
  await saved(other, targetId).poll((c) => c.nodes.map((m) => m.data.label)).toEqual(['X', 'From tab one']);
  expect((await stored(other, targetId)).nodes[1].data).toMatchObject({ shape: 'ellipse', link: 'https://example.com' });

  // Cut in the first tab removes it.
  await page.bringToFront();
  await node(page, 'a').click();
  await page.keyboard.press('ControlOrMeta+x');
  await expect(node(page, 'a')).toHaveCount(0);
});
