import { expect, test, type Locator, type Page } from '@playwright/test';
import { createFromQuickStart, readStore } from './helpers';

type StoredDiagram = {
  id: string;
  content: {
    nodes: Array<{ id: string; position: { x: number; y: number }; width: number; height: number; data: { label: string; shape: string } }>;
    edges: Array<{ source: string; target: string; sourceHandle: string; targetHandle: string; type: string }>;
  };
};

const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
const nodeByLabel = (page: Page, label: string) => page.locator('.react-flow__node', { hasText: label });
const arrow = (page: Page, side: 'above' | 'below' | 'to the left' | 'to the right') => page.getByRole('button', { name: `Add a connected shape ${side}` });

async function stored(page: Page, id: string) {
  return expect
    .poll(async () => (await readStore<StoredDiagram>(page, 'diagrams')).find((d) => d.id === id)?.content, { timeout: 10_000 })
    .toBeTruthy()
    .then(async () => (await readStore<StoredDiagram>(page, 'diagrams')).find((d) => d.id === id)!.content);
}

async function centre(l: Locator) {
  const b = (await l.boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2, box: b };
}

/** Drags with real pointer movement, so the preview and the drop target are exercised. */
async function dragTo(page: Page, from: Locator, to: { x: number; y: number }, during?: () => Promise<void>) {
  const a = await centre(from);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + to.x) / 2, (a.y + to.y) / 2, { steps: 6 });
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await during?.();
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
});

test('click an arrow: connected shape appears beside, selected, not overlapping; undo and redo cover it', async ({ page }) => {
  const id = await createFromQuickStart(page, 'Flowchart');
  await nodeByLabel(page, 'Read number N').click();
  await expect(page.locator('.dcos-qc-arrow')).toHaveCount(4);
  await expect(page.locator('.react-flow__node')).toHaveCount(6);

  await arrow(page, 'to the right').click();
  await expect(page.locator('.react-flow__node')).toHaveCount(7);
  await expect(page.locator('.react-flow__edge')).toHaveCount(7);
  const selected = page.locator('.react-flow__node.selected');
  await expect(selected).toHaveCount(1);
  await expect(selected).not.toContainText('Read number N');

  await expect.poll(async () => (await stored(page, id)).nodes.length).toBe(7);
  const after = await stored(page, id);
  const source = after.nodes.find((n) => n.data.label === 'Read number N')!;
  const original = ['Start', 'Read number N', 'Is N even?', 'Print "Even"', 'Print "Odd"', 'End'];
  const added = after.nodes.find((n) => !original.includes(n.data.label))!;
  expect(added.data.shape).toBe(source.data.shape); // a copy of the selected shape, like diagrams.net
  expect(added.position.x).toBeGreaterThanOrEqual(source.position.x + source.width + 40);
  expect(Math.round(added.position.y + added.height / 2)).toBe(Math.round(source.position.y + source.height / 2));
  for (const other of after.nodes.filter((n) => n.id !== added.id)) {
    const overlap =
      added.position.x < other.position.x + other.width && other.position.x < added.position.x + added.width && added.position.y < other.position.y + other.height && other.position.y < added.position.y + added.height;
    expect(overlap, `overlaps ${other.data.label}`).toBe(false);
  }
  expect(after.edges.find((e) => e.target === added.id)).toMatchObject({ source: source.id, sourceHandle: 'r', targetHandle: 'l', type: 'smoothstep' });

  await page.keyboard.press(`${mod}+z`);
  await expect(page.locator('.react-flow__node')).toHaveCount(6);
  await expect(page.locator('.react-flow__edge')).toHaveCount(6);
  await page.keyboard.press(`${mod}+Shift+z`);
  await expect(page.locator('.react-flow__node')).toHaveCount(7);
  await expect(page.locator('.react-flow__edge')).toHaveCount(7);
});

test('arrows stay beside the shape through zoom, pan and moves', async ({ page }) => {
  await createFromQuickStart(page, 'Flowchart');
  const node = nodeByLabel(page, 'Read number N');
  await node.click();

  const check = async () => {
    await page.waitForTimeout(250); // let the entrance animation finish
    const n = (await node.boundingBox())!;
    const top = (await arrow(page, 'above').boundingBox())!;
    const right = (await arrow(page, 'to the right').boundingBox())!;
    expect(Math.abs(top.x + top.width / 2 - (n.x + n.width / 2))).toBeLessThan(3);
    expect(top.y + top.height).toBeLessThan(n.y);
    expect(n.y - (top.y + top.height)).toBeLessThan(40);
    expect(right.x).toBeGreaterThan(n.x + n.width);
    expect(Math.abs(right.y + right.height / 2 - (n.y + n.height / 2))).toBeLessThan(3);
    expect(Math.round(top.width)).toBe(28); // constant size regardless of zoom
  };
  await check();

  await page.getByRole('button', { name: /zoom in/i }).click();
  await page.getByRole('button', { name: /zoom in/i }).click();
  await page.waitForTimeout(300);
  await check();

  // Pan the canvas by dragging empty space.
  const pane = (await page.locator('.react-flow__pane').boundingBox())!;
  await page.mouse.move(pane.x + 40, pane.y + pane.height - 40);
  await page.mouse.down();
  await page.mouse.move(pane.x + 140, pane.y + pane.height - 90, { steps: 8 });
  await page.mouse.up();
  await node.click();
  await check();

  // Move the shape.
  const c = await centre(node);
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(c.x + 90, c.y + 40, { steps: 8 });
  await page.mouse.up();
  await check();
});

test('drag an arrow onto a shape to connect it, with a preview; duplicates are refused; empty canvas creates a shape', async ({ page }) => {
  const id = await createFromQuickStart(page, 'Flowchart');
  await nodeByLabel(page, 'Print "Even"').click();
  const target = await centre(nodeByLabel(page, 'Print "Odd"'));

  await dragTo(page, arrow(page, 'to the right'), target, async () => {
    await expect(page.locator('.dcos-qc-preview line')).toBeVisible();
    await expect(page.locator('.dcos-qc-target')).toBeVisible();
  });
  await expect(page.locator('.react-flow__edge')).toHaveCount(7);
  await expect.poll(async () => (await stored(page, id)).edges.length).toBe(7);
  const content = await stored(page, id);
  const even = content.nodes.find((n) => n.data.label === 'Print "Even"')!;
  const odd = content.nodes.find((n) => n.data.label === 'Print "Odd"')!;
  expect(content.edges.find((e) => e.source === even.id && e.target === odd.id)).toMatchObject({ sourceHandle: 'r', targetHandle: 'l' });

  // The same connection again is refused, with an explanation.
  await nodeByLabel(page, 'Print "Even"').click();
  await dragTo(page, arrow(page, 'to the right'), await centre(nodeByLabel(page, 'Print "Odd"')));
  await expect(page.getByText('These shapes are already connected.')).toBeVisible();
  await expect(page.locator('.react-flow__edge')).toHaveCount(7);

  // Dropping on empty canvas creates a connected shape there.
  await nodeByLabel(page, 'Print "Even"').click();
  const e = await centre(nodeByLabel(page, 'Print "Even"'));
  await dragTo(page, arrow(page, 'to the left'), { x: e.x - 260, y: e.y + 120 });
  await expect(page.locator('.react-flow__node')).toHaveCount(7);
  await expect(page.locator('.react-flow__edge')).toHaveCount(8);
});

test('shape palette with preview, and keyboard access', async ({ page }) => {
  const id = await createFromQuickStart(page, 'Flowchart');
  await nodeByLabel(page, 'End').click();

  // Move the pointer like a user (Playwright's hover() adds extra moves that leave and re-enter).
  const a = await centre(arrow(page, 'to the right'));
  await page.mouse.move(a.x, a.y, { steps: 4 });
  const palette = page.getByRole('menu', { name: 'Shapes to add to the right' });
  await expect(palette).toBeVisible();
  const item = await centre(palette.getByRole('menuitem', { name: 'Add Decision to the right' }));
  await page.mouse.move(item.x, item.y, { steps: 6 });
  await expect(page.locator('.dcos-qc-ghost')).toBeVisible();
  await palette.getByRole('menuitem', { name: 'Add Decision to the right' }).click();
  await expect(page.locator('.react-flow__node')).toHaveCount(7);
  await expect.poll(async () => (await stored(page, id)).nodes.filter((n) => n.data.shape === 'diamond').length).toBe(2);

  // Keyboard: Alt+Shift+Arrow (the diagrams.net shortcut) …
  await nodeByLabel(page, 'Start').click();
  await page.keyboard.press('Alt+Shift+ArrowLeft');
  await expect(page.locator('.react-flow__node')).toHaveCount(8);
  // … and Enter on a focused arrow.
  await nodeByLabel(page, 'Start').click();
  await arrow(page, 'above').focus();
  await expect(page.getByRole('menu', { name: 'Shapes to add above' })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.locator('.react-flow__node')).toHaveCount(9);
  await expect(page.locator('.react-flow__edge')).toHaveCount(9);
});
