import { expect, test } from './fixtures';
import { largeDiagramFile } from '../tests/fixtures/diagrams/large';
import { downloadBytes, readStore } from './helpers';

type Stored = { id: string; content: { nodes: Array<{ id: string; position: { x: number; y: number } }> } };

/** Width and height from a PNG's IHDR chunk. */
const pngSize = (b: Buffer) => ({ width: b.readUInt32BE(16), height: b.readUInt32BE(20) });

test('a 500-shape diagram renders, a shape can be dragged and saved, and the PNG export stays within canvas limits', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('./#/diagrams');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Import diagram file' }).click()]);
  await chooser.setFiles({ name: 'Large 500.dcosdiagram', mimeType: 'application/json', buffer: Buffer.from(largeDiagramFile(500)) });
  await expect(page).toHaveURL(/#\/diagrams\/[0-9a-f-]{36}$/);
  const id = page.url().split('/').pop()!;
  await expect(page.locator('.react-flow__node')).toHaveCount(500, { timeout: 30_000 });
  const edges = await page.locator('.react-flow__edge').count();
  expect(edges).toBeGreaterThan(500);

  // Shared marker definitions (TD-21): a handful of <marker> elements, and every connector's reference resolves.
  const markers = await page.evaluate(() => {
    const ids = new Set([...document.querySelectorAll('marker')].map((m) => m.id));
    const refs = [...document.querySelectorAll('.react-flow__edge-path')].flatMap((p) => ['marker-start', 'marker-end'].map((a) => p.getAttribute(a)).filter((r): r is string => !!r));
    return { count: ids.size, refs: refs.length, dangling: refs.filter((r) => !ids.has(r.slice(5, -1))).length };
  });
  expect(markers.count).toBeLessThanOrEqual(10);
  expect(markers.refs).toBeGreaterThan(500);
  expect(markers.dangling).toBe(0);

  // Zoom in on one shape and drag it.
  const node = page.locator('.react-flow__node[data-id="n0"]');
  await page.getByRole('button', { name: 'Fit diagram to screen' }).click();
  await page.waitForTimeout(600); // the fit animates for 300 ms
  const before = (await node.boundingBox())!;
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down();
  await page.mouse.move(before.x + before.width / 2 + 80, before.y + before.height / 2 + 60, { steps: 8 });
  await page.mouse.up();
  const after = (await node.boundingBox())!;
  expect(after.x - before.x).toBeGreaterThan(40);
  await expect
    .poll(async () => (await readStore<Stored>(page, 'diagrams')).find((d) => d.id === id)!.content.nodes.find((n) => n.id === 'n0')!.position.x, { timeout: 15_000 })
    .toBeGreaterThan(0);

  // At 2× this diagram would need about 65 million pixels: the export lowers the ratio and says so.
  await page.getByRole('button', { name: 'Export' }).click();
  // G-EXPORT draws the PNG from the diagram's content (vector SVG, no foreignObject, a Blob URL), so WebKit exports
  // this diagram too; it used to refuse html-to-image's data URL for a drawing this large.
  const [png] = await Promise.all([page.waitForEvent('download', { timeout: 90_000 }), page.getByRole('menuitem', { name: /^PNG/ }).click()]);
  const bytes = await downloadBytes(png);
  expect(bytes.subarray(0, 4).toString('latin1')).toBe('\u0089PNG');
  const { width, height } = pngSize(bytes);
  expect(width * height).toBeLessThanOrEqual(16_777_216);
  expect(Math.max(width, height)).toBeLessThanOrEqual(16_384);
  expect(width).toBeGreaterThan(1000);
  await expect(page.getByText(/too large for a 2× image, so it was drawn at [0-9.]+×/)).toBeVisible();
});
