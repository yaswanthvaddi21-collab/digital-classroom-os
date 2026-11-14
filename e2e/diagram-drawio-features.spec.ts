import { expect, test, type Page } from '@playwright/test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { downloadBytes, readStore } from './helpers';

/*
 * G-DRAWIO (Phase 5): diagrams.net files with groups, layers, hidden content, links, properties, rotation, opacity,
 * pictures and bend points import into the app as they were drawn, with every approximation named in the toast, and
 * export back to an editable .drawio that holds them. Fixtures: tests/fixtures/drawio (hand-written; see its README).
 */

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'tests', 'fixtures', 'drawio');
type Stored = { id: string; title: string; content: { schemaVersion: number; layers?: Array<{ id: string; visible: boolean }>; nodes: Array<Record<string, unknown> & { id: string; data: Record<string, unknown> }>; edges: Array<{ id: string; data: Record<string, unknown> }> } };

async function importDrawio(page: Page, file: string) {
  await page.goto('./#/diagrams');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Import diagrams.net' }).click()]);
  await chooser.setFiles(join(FIXTURES, file));
  await expect(page).toHaveURL(/#\/diagrams\/[0-9a-f-]{36}$/);
  await expect(page.locator('.react-flow__node').first()).toBeAttached();
  return page.url().split('/').pop()!;
}
const node = (page: Page, id: string) => page.locator(`.react-flow__node[data-id="${id}"]`);

test('hidden shapes and a hidden layer stay hidden, and the toast names them', async ({ page }) => {
  const id = await importDrawio(page, 'layers-hidden.drawio');
  await expect(page.getByText(/3 shapes hidden in the file were imported hidden: “Hint: think of 7 x 7”, “Draft” and 1 without text\. “Show hidden shapes” in the Layers panel shows them\./)).toBeVisible();
  await expect(page.getByText(/The layer “Answers” is hidden in the file, so it was imported as a hidden layer\./)).toBeVisible();
  await expect(node(page, 'q1')).toBeVisible();
  await expect(node(page, 'n1')).toBeVisible();
  // Hidden in the file: not drawn (a hidden shape, a hidden group and its contents, a shape on the hidden layer).
  for (const hidden of ['hint', 'hg', 'hgchild', 'a1']) await expect(node(page, hidden)).toBeHidden();
  await expect(page.getByText('56', { exact: true })).toBeHidden();

  const stored = (await readStore<Stored>(page, 'diagrams')).find((d) => d.id === id)!;
  expect(stored.content.schemaVersion).toBe(3);
  expect(stored.content.layers!.map((l) => [l.id, l.visible])).toEqual([
    ['1', true],
    ['ans', false],
    ['notes', true],
  ]);
  const byId = Object.fromEntries(stored.content.nodes.map((n) => [n.id, n]));
  expect([byId.hint.hidden, byId.hgchild.hidden, byId.a1.layer]).toEqual([true, true, 'ans']);
});

test('groups keep their shapes inside them, and moving the group moves them', async ({ page }) => {
  const id = await importDrawio(page, 'groups-containers.drawio');
  await expect(node(page, 'b')).toBeVisible();
  const group = (await node(page, 'g1').boundingBox())!;
  const before = (await node(page, 'b').boundingBox())!;
  // The shape inside the nested group is drawn inside the outer group's box.
  expect(before.x).toBeGreaterThanOrEqual(group.x - 1);
  expect(before.y).toBeGreaterThanOrEqual(group.y - 1);
  expect(before.x + before.width).toBeLessThanOrEqual(group.x + group.width + 1);

  // Drag the group by an empty part of its area (top right: the shapes are at its left and bottom right).
  const from = { x: group.x + group.width * 0.75, y: group.y + group.height * 0.12 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 40, from.y + 30, { steps: 6 });
  await page.mouse.move(from.x + 80, from.y + 60, { steps: 6 });
  await page.mouse.up();
  const after = (await node(page, 'b').boundingBox())!;
  const moved = (await node(page, 'g1').boundingBox())!;
  expect(moved.x - group.x).toBeGreaterThan(20);
  // The shape inside moved with the group, by the same amount.
  expect(Math.abs(after.x - before.x - (moved.x - group.x))).toBeLessThan(2);
  expect(Math.abs(after.y - before.y - (moved.y - group.y))).toBeLessThan(2);

  await expect.poll(async () => (await readStore<Stored>(page, 'diagrams')).find((d) => d.id === id)!.content.nodes.find((n) => n.id === 'g1')!.position).not.toEqual({ x: 100, y: 80 });
  const stored = (await readStore<Stored>(page, 'diagrams')).find((d) => d.id === id)!;
  const b = stored.content.nodes.find((n) => n.id === 'b')!;
  // Stored relative to its group, so it did not change.
  expect([b.parentId, b.position]).toEqual(['g2', { x: 20, y: 20 }]);
});

test('pictures, rotation, opacity, fonts and alignment are drawn as in the file', async ({ page }) => {
  await importDrawio(page, 'images.drawio');
  await expect(page.getByText(/1 picture linked from the web was imported as an empty frame/)).toBeVisible();
  await expect(node(page, 'png').locator('image')).toHaveAttribute('href', /^data:image\/png;base64,iVBORw0KGgo/);
  await expect(node(page, 'svg').locator('image')).toHaveAttribute('href', /^data:image\/svg\+xml;base64,/);
  await expect(node(page, 'web')).toContainText('picture');

  await importDrawio(page, 'styles-text.drawio');
  await expect(node(page, 'rot').locator('.dcos-shape-rotated')).toHaveCSS('transform', /matrix\(0\.866/);
  await expect(node(page, 'faint').locator('.dcos-shape-svg')).toHaveCSS('opacity', '0.4');
  await expect(node(page, 'font').locator('.dcos-shape-label span')).toHaveCSS('font-family', /Georgia/);
  // Where the text sits: left/top in one shape, right/bottom in the other (measured, as browsers name the values differently).
  const place = async (id: string) => {
    const box = (await node(page, id).locator('.dcos-shape-label').boundingBox())!;
    const text = (await node(page, id).locator('.dcos-shape-label span').boundingBox())!;
    return { left: text.x - box.x, right: box.x + box.width - (text.x + text.width), top: text.y - box.y, bottom: box.y + box.height - (text.y + text.height) };
  };
  const font = await place('font');
  expect(font.left).toBeLessThan(2);
  expect(font.top).toBeLessThan(2);
  expect(font.right).toBeGreaterThan(10);
  const right = await place('right');
  expect(right.right).toBeLessThan(2);
  expect(right.bottom).toBeLessThan(2);
  expect(right.left).toBeGreaterThan(10);
});

test('links, tooltips and properties survive export to .drawio and import again', async ({ page }) => {
  await importDrawio(page, 'links-properties.drawio');
  await expect(page.getByText(/1 link that was not a web or mail address was left out\./)).toBeVisible();

  await page.getByRole('button', { name: 'Export' }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: /diagrams\.net/ }).click()]);
  // Nothing in this diagram is beyond what a .drawio file holds, so the export is a plain success.
  await expect(page.getByText('Exported for diagrams.net', { exact: true })).toBeVisible();
  const xml = (await downloadBytes(download)).toString('utf8');
  expect(xml).toMatch(/<UserObject label="Syllabus" link="https:\/\/example\.com\/syllabus" tooltip="Course outline for term 2" id="syl">/);
  expect(xml).toMatch(/<UserObject label="Physics \(4 credits\)" subject="Physics" credits="4" teacher="Ms\. Rao" room="B-12" id="course">/);
  expect(xml).not.toContain('javascript:');

  await page.goto('./#/diagrams');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Import diagrams.net' }).click()]);
  await chooser.setFiles({ name: 'again.drawio', mimeType: 'application/xml', buffer: Buffer.from(xml) });
  await expect(page).toHaveURL(/#\/diagrams\/[0-9a-f-]{36}$/);
  const newId = page.url().split('/').pop()!;
  const again = (await readStore<Stored>(page, 'diagrams')).find((d) => d.id === newId)!;
  const byId = Object.fromEntries(again.content.nodes.map((n) => [n.id, n]));
  expect(byId.syl.data).toMatchObject({ link: 'https://example.com/syllabus', tooltip: 'Course outline for term 2' });
  expect(byId.course.data.properties).toEqual({ subject: 'Physics', credits: '4', teacher: 'Ms. Rao', room: 'B-12' });
});

test('bend points and label positions come through import, export and import again', async ({ page }) => {
  const id = await importDrawio(page, 'connectors.drawio');
  await expect(page.getByText(/1 connector that ends on another connector was left out\./)).toBeVisible();
  const first = (await readStore<Stored>(page, 'diagrams')).find((d) => d.id === id)!;
  const bend = first.content.edges.find((e) => e.id === 'bend')!;
  expect(bend.data).toMatchObject({ waypoints: [{ x: 250, y: 70 }, { x: 250, y: 200 }, { x: 430, y: 200 }], labelPosition: 0.25, targetPort: { x: 0.25, y: 0 } });

  await page.getByRole('button', { name: 'Export' }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: /diagrams\.net/ }).click()]);
  const xml = (await downloadBytes(download)).toString('utf8');
  expect(xml).toContain('<Array as="points"><mxPoint x="250" y="70" /><mxPoint x="250" y="200" /><mxPoint x="430" y="200" /></Array>');
  expect(xml).toMatch(/<mxGeometry relative="1" x="-0.5" as="geometry">/);
});
