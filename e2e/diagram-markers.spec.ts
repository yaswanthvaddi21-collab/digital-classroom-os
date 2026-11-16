import { expect, test } from './fixtures';
import { createFromQuickStart, downloadBytes } from './helpers';

// Connector ends are shared <marker> definitions (TD-21). The image exports capture the canvas, so the definitions
// must travel with it: every end a connector references is defined in the exported SVG.
test('connector ends are shared definitions on the canvas and in the SVG export', async ({ page }) => {
  await page.goto('./#/diagrams');
  await page.getByRole('button', { name: 'New diagram' }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: /UML class diagram/ }).click();
  await expect(page.locator('.react-flow__edge')).toHaveCount(3);

  const onCanvas = await page.evaluate(() => ({
    markers: [...document.querySelectorAll('marker')].map((m) => m.id),
    refs: [...document.querySelectorAll('.react-flow__edge-path')].flatMap((p) => ['marker-start', 'marker-end'].map((a) => p.getAttribute(a)).filter(Boolean)),
  }));
  // triangle (twice, same colour) + diamond + open arrow: three definitions for four drawn ends.
  expect(onCanvas.refs).toHaveLength(4);
  expect(new Set(onCanvas.markers).size).toBe(3);
  for (const ref of onCanvas.refs) expect(onCanvas.markers.map((id) => `url(#${id})`)).toContain(ref);

  await page.getByRole('button', { name: 'Export' }).click();
  const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: /^SVG/ }).click()]);
  const svg = (await downloadBytes(file)).toString('utf8');
  const defined = new Set([...svg.matchAll(/<marker[^>]*\bid="([^"]+)"/g)].map((m) => m[1]));
  const used = [...svg.matchAll(/marker-(?:start|end)="url\(#([^)"]+)\)"/g)].map((m) => m[1]);
  expect(used.length).toBe(4);
  for (const id of used) expect(defined).toContain(id);
});

test('the flowchart template still opens with every connector drawn', async ({ page }) => {
  await createFromQuickStart(page, 'Flowchart');
  await expect(page.locator('.react-flow__edge-path[marker-end]')).toHaveCount(6);
});
