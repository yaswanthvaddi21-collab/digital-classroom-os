import { expect, test } from './fixtures';
import { createFromQuickStart, downloadBytes, readStore } from './helpers';

type Stored = { id: string; content: { nodes: Array<{ id: string; position: { x: number; y: number }; data: { label: string } }>; edges: unknown[] } };

test('flowchart: drag keeps connectors, undo/redo, reload, export', async ({ page }) => {
  const id = await createFromQuickStart(page, 'Flowchart');
  const node = page.locator('.react-flow__node', { hasText: 'Print "Odd"' });
  await expect(node).toBeVisible();
  await expect(page.locator('.react-flow__edge')).toHaveCount(6);
  const edgesBefore = 6;

  const box = (await node.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 - 80, { steps: 8 });
  await page.mouse.up();
  const moved = (await node.boundingBox())!;
  expect(Math.round(moved.x - box.x)).toBeGreaterThan(60);
  await expect(page.locator('.react-flow__edge')).toHaveCount(edgesBefore);

  const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
  await page.keyboard.press(`${mod}+z`);
  await expect.poll(async () => Math.round((await node.boundingBox())!.x)).toBe(Math.round(box.x));
  await page.keyboard.press(`${mod}+Shift+z`);
  await expect.poll(async () => Math.round((await node.boundingBox())!.x)).toBe(Math.round(moved.x));

  await expect
    .poll(async () => {
      const [d] = (await readStore<Stored>(page, 'diagrams')).filter((x) => x.id === id);
      return d.content.nodes.find((n) => n.data.label === 'Print "Odd"')!.position.x;
    }, { timeout: 10_000 })
    .not.toBe(370);

  await page.reload();
  await expect(page.locator('.react-flow__node')).toHaveCount(6);
  await expect(page.locator('.react-flow__edge')).toHaveCount(6);

  for (const [item, magic] of [
    [/^PNG/, '\u0089PNG'],
    [/^PDF/, '%PDF'],
    [/^SVG/, '<svg'],
  ] as const) {
    await page.getByRole('button', { name: /export/i }).click();
    const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: item }).click()]);
    expect((await downloadBytes(file)).subarray(0, magic.length).toString('latin1')).toBe(magic);
  }
});

test('tree: Tab adds a child and the tree re-arranges', async ({ page }) => {
  await createFromQuickStart(page, 'Tree diagram');
  await expect(page.locator('.react-flow__node')).toHaveCount(9);
  await page.locator('.react-flow__node', { hasText: 'Branch C' }).click();
  await page.keyboard.press('Tab');
  await page.keyboard.type('Leaf C2');
  await page.keyboard.press('Enter');
  await expect(page.locator('.react-flow__node')).toHaveCount(10);
  await expect(page.locator('.react-flow__node', { hasText: 'Leaf C2' })).toBeVisible();
  await expect(page.locator('.react-flow__edge')).toHaveCount(9);
});
