import { expect, test } from './fixtures';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFromQuickStart, downloadBytes, readStore } from './helpers';

type StoredDiagram = { id: string; title: string; content: { schemaVersion: number; nodes: Array<{ id: string; data: Record<string, unknown> } & Record<string, unknown>>; edges: unknown[]; layers?: unknown[] } };
const DRAWIO_FIXTURE = join(dirname(fileURLToPath(import.meta.url)), '..', 'tests', 'fixtures', 'drawio', 'library-system.drawio');

test('a diagram exported as .dcosdiagram imports as a new, identical diagram; the original is untouched', async ({ page }) => {
  const id = await createFromQuickStart(page, 'Flowchart');
  await expect(page.locator('.react-flow__node')).toHaveCount(6);

  await page.getByRole('button', { name: 'Export' }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: /\.dcosdiagram/ }).click()]);
  expect(download.suggestedFilename()).toBe('Flowchart.dcosdiagram');
  const bytes = await downloadBytes(download);
  const file = JSON.parse(bytes.toString('utf8'));
  expect(file).toMatchObject({ format: 'dcos-diagram', version: 1, title: 'Flowchart' });
  expect(file.diagram.schemaVersion).toBe(2);
  expect(file.diagram.nodes).toHaveLength(6);
  await expect(page.getByText('Exported Classroom OS diagram file')).toBeVisible();

  await page.goto('./#/diagrams');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Import diagram file' }).click()]);
  await chooser.setFiles({ name: 'Flowchart.dcosdiagram', mimeType: 'application/json', buffer: bytes });
  await expect(page).toHaveURL(/#\/diagrams\/[0-9a-f-]{36}$/);
  const newId = page.url().split('/').pop()!;
  expect(newId).not.toBe(id);
  await expect(page.locator('.react-flow__node')).toHaveCount(6);
  await expect(page.locator('.react-flow__edge')).toHaveCount(6);
  await expect(page.getByText(/Opened “Flowchart” as a new diagram/)).toBeVisible();

  const stored = await readStore<StoredDiagram>(page, 'diagrams');
  expect(stored).toHaveLength(2);
  const copy = stored.find((d) => d.id === newId)!;
  const original = stored.find((d) => d.id === id)!;
  expect(copy.title).toBe('Flowchart');
  expect(copy.content).toEqual(file.diagram);
  // The original was only viewed: still as created (the file also carries the view it was exported with).
  expect(original.content).toEqual({ ...file.diagram, viewport: null });
});

test('a damaged or newer file is refused with the reason, and nothing is created', async ({ page }) => {
  await page.goto('./#/diagrams');
  const bad = [
    ['broken.dcosdiagram', '{ not json', /not valid JSON/],
    ['newer.dcosdiagram', JSON.stringify({ format: 'dcos-diagram', version: 9, diagram: {} }), /newer file format.*Update the app/],
  ] as const;
  for (const [name, text, reason] of bad) {
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Import diagram file' }).click()]);
    await chooser.setFiles({ name, mimeType: 'application/json', buffer: Buffer.from(text) });
    await expect(page.getByText(new RegExp(`Could not open “${name.replace('.dcosdiagram', '')}”: .*${reason.source}`))).toBeVisible();
  }
  await expect(page).toHaveURL(/#\/diagrams$/);
  expect(await readStore(page, 'diagrams')).toHaveLength(0);
});

test('Open file… in the editor opens a diagrams.net file or a .dcosdiagram as a new diagram', async ({ page }) => {
  const id = await createFromQuickStart(page, 'Flowchart');
  await page.getByRole('button', { name: 'Export' }).click();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('menuitem', { name: /Open file…/ }).click()]);
  await chooser.setFiles(DRAWIO_FIXTURE);
  // The original diagram's URL already matches the pattern, so wait for the URL to leave it first.
  await expect.poll(() => page.url()).not.toContain(id);
  await expect(page).toHaveURL(/#\/diagrams\/[0-9a-f-]{36}$/);
  await expect(page.locator('.react-flow__node', { hasText: 'Book' })).toBeVisible();
  const stored = await readStore<StoredDiagram>(page, 'diagrams');
  expect(stored).toHaveLength(2);
  expect(stored.find((d) => d.id === id)!.content.nodes).toHaveLength(6);
});

test('a schema-3 diagram (group, layer, lock, rotation, link, waypoints) imports, edits and saves as schema 3 with every field', async ({ page }) => {
  const style = { fill: '#ffffff', stroke: '#334155', strokeWidth: 2, textColor: '#0f172a', fontSize: 14, dashed: false, bold: false };
  const diagram = {
    schemaVersion: 3,
    nodes: [
      { id: 'g', position: { x: 0, y: 0 }, width: 400, height: 200, data: { ...style, shape: 'group', label: '' } },
      { id: 'a', position: { x: 20, y: 40 }, width: 140, height: 60, parentId: 'g', locked: true, layer: 'L1', data: { ...style, shape: 'rounded', label: 'Inside', rotation: 10, link: 'https://example.com', tooltip: 'tip', properties: { k: 'v' } } },
      { id: 'b', position: { x: 600, y: 40 }, width: 140, height: 60, data: { ...style, shape: 'rectangle', label: 'Outside' } },
    ],
    edges: [{ id: 'e', source: 'a', target: 'b', sourceHandle: 'r', targetHandle: 'l', type: 'smoothstep', label: '', data: { color: '#475569', width: 2, dashed: false, arrow: 'end', waypoints: [{ x: 400, y: 300 }], labelPosition: 0.3 } }],
    viewport: null,
    settings: { snapToGrid: true, showGrid: true, autoLayout: 'none' },
    layers: [{ id: 'L1', name: 'Base', visible: true, locked: false }],
  };
  await page.goto('./#/diagrams');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Import diagram file' }).click()]);
  await chooser.setFiles({ name: 'Sink.dcosdiagram', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ format: 'dcos-diagram', version: 1, app: 'test', title: 'Sink', diagram })) });
  await expect(page).toHaveURL(/#\/diagrams\/[0-9a-f-]{36}$/);
  const id = page.url().split('/').pop()!;
  // The child is drawn inside its group: React Flow places it relative to the group.
  const group = (await page.locator('.react-flow__node[data-id="g"]').boundingBox())!;
  const inside = (await page.locator('.react-flow__node[data-id="a"]').boundingBox())!;
  expect(inside.x).toBeGreaterThan(group.x);
  expect(inside.y).toBeGreaterThan(group.y);

  // An edit elsewhere saves the diagram as schema 3 with every field intact.
  await page.locator('.react-flow__node', { hasText: 'Outside' }).click();
  await page.getByRole('complementary', { name: 'Format' }).getByRole('button', { name: '#dcfce7' }).click();
  await expect
    .poll(async () => (await readStore<StoredDiagram>(page, 'diagrams')).find((d) => d.id === id)!.content.nodes.find((n) => n.id === 'b')!.data.fill, { timeout: 10_000 })
    .toBe('#dcfce7');
  const saved = (await readStore<StoredDiagram>(page, 'diagrams')).find((d) => d.id === id)!.content;
  expect(saved.schemaVersion).toBe(3);
  expect(saved.nodes.find((n) => n.id === 'a')).toEqual(diagram.nodes[1]);
  expect(saved.edges).toEqual(diagram.edges);
  expect(saved.layers).toEqual(diagram.layers);
});

test('quick connect and Enter on a shape inside a group place the new shape where the user sees it, in the group', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  const style = { fill: '#ffffff', stroke: '#334155', strokeWidth: 2, textColor: '#0f172a', fontSize: 14, dashed: false, bold: false };
  const diagram = {
    schemaVersion: 3,
    nodes: [
      { id: 'g', position: { x: 300, y: 200 }, width: 400, height: 240, data: { ...style, shape: 'group', label: '' } },
      { id: 'c', position: { x: 10, y: 10 }, width: 120, height: 60, parentId: 'g', data: { ...style, shape: 'rectangle', label: 'Child' } },
      { id: 'b', position: { x: 300, y: 700 }, width: 120, height: 60, data: { ...style, shape: 'rectangle', label: 'Below' } },
    ],
    edges: [],
    viewport: null,
    settings: { snapToGrid: false, showGrid: true, autoLayout: 'none' },
  };
  await page.goto('./#/diagrams');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Import diagram file' }).click()]);
  await chooser.setFiles({ name: 'Grouped.dcosdiagram', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ format: 'dcos-diagram', version: 1, app: 'test', title: 'Grouped', diagram })) });
  await expect(page).toHaveURL(/#\/diagrams\/[0-9a-f-]{36}$/);
  const id = page.url().split('/').pop()!;
  const box = async (nodeId: string) => (await page.locator(`.react-flow__node[data-id="${nodeId}"]`).boundingBox())!;
  const added = async (known: string[]) =>
    expect
      .poll(async () => (await readStore<StoredDiagram>(page, 'diagrams')).find((d) => d.id === id)!.content.nodes.find((n) => !known.includes(n.id))?.id, { timeout: 10_000 })
      .toBeTruthy()
      .then(async () => (await readStore<StoredDiagram>(page, 'diagrams')).find((d) => d.id === id)!.content.nodes.find((n) => !known.includes(n.id))!);

  // Drag the child's right arrow to empty canvas between the group and the shape below it.
  // G-CANVAS: the first click on a shape in a group selects the group, the second the shape (diagrams.net).
  await page.locator('.react-flow__node[data-id="c"]').click();
  await page.locator('.react-flow__node[data-id="c"]').click();
  const group = await box('g');
  const below = await box('b');
  const drop = { x: group.x + group.width / 2, y: (group.y + group.height + below.y) / 2 };
  const arrowBox = (await page.getByRole('button', { name: 'Add a connected shape to the right' }).boundingBox())!;
  await page.mouse.move(arrowBox.x + arrowBox.width / 2, arrowBox.y + arrowBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(drop.x, drop.y, { steps: 10 });
  await page.mouse.up();
  const dropped = await added(['g', 'c', 'b']);
  expect(dropped.parentId).toBe('g');
  const d = await box(dropped.id);
  expect(Math.abs(d.x + d.width / 2 - drop.x)).toBeLessThan(4);
  expect(Math.abs(d.y + d.height / 2 - drop.y)).toBeLessThan(4);

  // Enter adds a sibling next to the child, inside the same group.
  await page.locator('.react-flow__node[data-id="c"]').click();
  await page.keyboard.press('Enter');
  const sibling = await added(['g', 'c', 'b', dropped.id]);
  expect(sibling.parentId).toBe('g');
  const child = await box('c');
  const s = await box(sibling.id);
  expect(s.x).toBeGreaterThan(child.x + child.width);
  expect(s.x).toBeLessThan(child.x + child.width * 3);
  expect(Math.abs(s.y + s.height / 2 - (child.y + child.height / 2))).toBeLessThan(child.height);
});
