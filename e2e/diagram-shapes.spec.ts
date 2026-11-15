import { expect, test, type Page } from './fixtures';
import { createFromQuickStart, readStore } from './helpers';

/** Phase 5 G-SHAPES: shape library categories and search, BPMN containers, mind map and timeline layouts, notations. */

type Node = { id: string; parentId?: string; position: { x: number; y: number }; width: number; height: number; data: { shape: string; label: string } & Record<string, unknown> };
type Edge = { id: string; source: string; target: string; type: string; data: Record<string, unknown> };
type Stored = { id: string; content: { schemaVersion: number; nodes: Node[]; edges: Edge[]; settings: { autoLayout: string } } };

const mod = process.platform === 'darwin' ? 'Meta' : 'Control';

async function createFromTemplate(page: Page, name: string) {
  await page.goto('./#/diagrams');
  await page.getByRole('button', { name: /^New diagram/ }).first().click();
  await page.getByRole('dialog').getByText(name, { exact: true }).click();
  await expect(page).toHaveURL(/#\/diagrams\/[0-9a-f-]{36}$/);
  return page.url().split('/').pop()!;
}

async function stored(page: Page, id: string) {
  return (await readStore<Stored>(page, 'diagrams')).find((d) => d.id === id)!.content;
}

const node = (page: Page, id: string) => page.locator(`.react-flow__node[data-id="${id}"]`);

/** Canvas position of a stored node (adding the positions of the containers it is in). */
function canvasOf(nodes: Node[], id: string) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  let n = byId.get(id)!;
  const p = { ...n.position };
  while (n.parentId && byId.get(n.parentId)) {
    n = byId.get(n.parentId)!;
    p.x += n.position.x;
    p.y += n.position.y;
  }
  return p;
}

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 6 });
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
}

const centre = (b: { x: number; y: number; width: number; height: number }) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });

test('BPMN: lanes hold their shapes; a task dragged to the other lane or out of the pool changes container; Add lane grows the pool', async ({ page }) => {
  const id = await createFromTemplate(page, 'Business process (BPMN)');
  await expect(page.locator('.react-flow__node')).toHaveCount(13);
  let c = await stored(page, id);
  expect(c.schemaVersion).toBe(3);
  expect(c.nodes.find((n) => n.id === 'write')!.parentId).toBe('student');
  const before = canvasOf(c.nodes, 'write');

  // Into the Teacher lane, on empty space at its left.
  const teacher = (await node(page, 'teacher').boundingBox())!;
  const write = (await node(page, 'write').boundingBox())!;
  const into = { x: teacher.x + teacher.width * 0.12, y: teacher.y + teacher.height * 0.55 };
  await drag(page, centre(write), into);
  await expect.poll(async () => (await stored(page, id)).nodes.find((n) => n.id === 'write')!.parentId).toBe('teacher');
  // Stored inside the lane where it is drawn: its position is relative to the lane, at the canvas zoom.
  c = await stored(page, id);
  const zoom = write.width / 140;
  const w2 = (await node(page, 'write').boundingBox())!;
  const t2 = (await node(page, 'teacher').boundingBox())!;
  const rel = c.nodes.find((n) => n.id === 'write')!.position;
  expect(Math.abs((w2.x - t2.x) / zoom - rel.x)).toBeLessThan(2);
  expect(Math.abs((w2.y - t2.y) / zoom - rel.y)).toBeLessThan(2);
  expect(canvasOf(c.nodes, 'write').y).toBeGreaterThan(before.y + 150);

  // Out of the pool: on the canvas again.
  const pool = (await node(page, 'pool').boundingBox())!;
  const now = (await node(page, 'write').boundingBox())!;
  await drag(page, centre(now), { x: pool.x + pool.width * 0.3, y: pool.y + pool.height + 60 });
  await expect.poll(async () => (await stored(page, id)).nodes.find((n) => n.id === 'write')!.parentId).toBeUndefined();

  // Undo puts it back in the Teacher lane.
  await page.keyboard.press(`${mod}+z`);
  await expect.poll(async () => (await stored(page, id)).nodes.find((n) => n.id === 'write')!.parentId).toBe('teacher');

  // Select the pool by its title band, then Add lane.
  await page.mouse.click(pool.x + 8, pool.y + pool.height / 2);
  await page.getByRole('button', { name: 'Add lane' }).click();
  await expect(page.locator('.react-flow__node')).toHaveCount(14);
  await expect.poll(async () => (await stored(page, id)).nodes.length).toBe(14);
  c = await stored(page, id);
  const lanes = c.nodes.filter((n) => n.data.shape === 'bpmnLane');
  expect(lanes).toHaveLength(3);
  expect(lanes.every((l) => l.parentId === 'pool')).toBe(true);
  const added = lanes.find((l) => l.id !== 'student' && l.id !== 'teacher')!;
  expect(added.position.y).toBe(440);
  expect(c.nodes.find((n) => n.id === 'pool')!.height).toBe(660);
});

test('shape library: categories, search, and a shape dropped on a lane joins it', async ({ page }) => {
  const id = await createFromTemplate(page, 'Business process (BPMN)');
  await expect(page.locator('.react-flow__node')).toHaveCount(13);
  const library = page.getByRole('complementary', { name: 'Shapes' });
  await library.getByRole('combobox', { name: 'Shape category' }).selectOption({ label: 'Business process (BPMN)' });
  for (const name of ['Pool', 'Lane', 'Start event', 'Exclusive gateway', 'Parallel gateway', 'Data store']) await expect(library.getByRole('button', { name: new RegExp(`^${name}`) })).toBeVisible();
  await expect(library.getByRole('button', { name: /^Rectangle/ })).toHaveCount(0);

  // Drag a task from the library onto empty space in the Student lane.
  const student = (await node(page, 'student').boundingBox())!;
  await library.getByRole('button', { name: /^Task/ }).dragTo(page.locator('.react-flow__pane'), { targetPosition: { x: student.x + student.width * 0.85 - (await page.locator('.react-flow__pane').boundingBox())!.x, y: student.y + student.height * 0.5 - (await page.locator('.react-flow__pane').boundingBox())!.y } });
  await expect(page.locator('.react-flow__node')).toHaveCount(14);
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await stored(page, id)).nodes.filter((n) => n.data.shape === 'bpmnTask' && n.parentId === 'student').length).toBe(3);

  // Search across every category.
  const search = library.getByRole('searchbox', { name: 'Search shapes' });
  await search.fill('router');
  await expect(library.getByText('1 shape found')).toBeVisible();
  await library.getByRole('button', { name: /^Router/ }).click();
  await expect(page.locator('.react-flow__node')).toHaveCount(15);
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await stored(page, id)).nodes.some((n) => n.data.shape === 'netRouter' && n.data.label === 'Router')).toBe(true);
  await search.fill('gateway');
  await expect(library.getByRole('button')).toHaveCount(3);
  await search.fill('qqqq');
  await expect(library.getByText('No shapes match “qqqq”.')).toBeVisible();
  await search.press('Escape');
  await expect(search).toHaveValue('');
});

test('mind map: radial and two-sided arrangements with curved branches', async ({ page }) => {
  const id = await createFromTemplate(page, 'Mind map');
  await expect(page.locator('.react-flow__node')).toHaveCount(11);
  await page.getByRole('button', { name: 'Arrange' }).click();
  await page.getByRole('menuitem', { name: 'Mind map: radial' }).click();
  await expect
    .poll(async () => {
      const c = await stored(page, id);
      return c.edges.every((e) => e.type === 'default') && c.settings.autoLayout === 'none';
    })
    .toBe(true);
  let c = await stored(page, id);
  const root = c.nodes.find((n) => n.data.label === 'Photosynthesis')!;
  const rc = { x: root.position.x + root.width / 2, y: root.position.y + root.height / 2 };
  const firstLevel = c.edges.filter((e) => e.source === root.id).map((e) => c.nodes.find((n) => n.id === e.target)!);
  const dist = firstLevel.map((n) => Math.hypot(n.position.x + n.width / 2 - rc.x, n.position.y + n.height / 2 - rc.y));
  expect(Math.max(...dist) - Math.min(...dist)).toBeLessThan(2);
  expect(c.schemaVersion).toBe(2);

  await page.getByRole('button', { name: 'Arrange' }).click();
  await page.getByRole('menuitem', { name: 'Mind map: two sides' }).click();
  await expect
    .poll(async () => {
      c = await stored(page, id);
      const xs = c.edges.filter((e) => e.source === root.id).map((e) => c.nodes.find((n) => n.id === e.target)!.position.x);
      return xs.some((x) => x > rc.x) && xs.some((x) => x < rc.x - 100);
    })
    .toBe(true);
});

test('timeline: Add event inserts a date and keeps the spacing even', async ({ page }) => {
  const id = await createFromTemplate(page, 'Timeline');
  await expect(page.locator('.react-flow__node')).toHaveCount(10);
  const dates = async () => {
    const c = await stored(page, id);
    return c.nodes.filter((n) => n.data.shape === 'timelineDate').sort((a, b) => a.position.x - b.position.x);
  };
  const even = (ds: Node[]) => {
    const gaps = ds.slice(1).map((d, i) => d.position.x - ds[i].position.x);
    return Math.max(...gaps) - Math.min(...gaps) <= 1 && new Set(ds.map((d) => d.position.y)).size === 1;
  };
  expect(even(await dates())).toBe(true);

  await page.getByRole('button', { name: 'Add event' }).click();
  await page.keyboard.type('2030');
  await page.keyboard.press('Enter');
  await expect(page.locator('.react-flow__node')).toHaveCount(12);
  await expect.poll(async () => (await dates()).map((d) => d.data.label).join()).toBe('1947,1950,1969,1991,2023,2030');
  expect(even(await dates())).toBe(true);

  // After a selected date: inserted next to it, and everything re-spaced.
  await node(page, 'd1').click();
  await page.getByRole('button', { name: 'Add event' }).click();
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await dates()).map((d) => d.data.label).join()).toBe('1947,1950,New date,1969,1991,2023,2030');
  expect(even(await dates())).toBe(true);
  const c = await stored(page, id);
  // The axis joins neighbours only: one connector between each pair of consecutive dates.
  const ds = await dates();
  const axis = c.edges.filter((e) => ds.some((d) => d.id === e.source) && ds.some((d) => d.id === e.target));
  expect(axis).toHaveLength(ds.length - 1);
});

test('connector notation: a BPMN message flow sets the dash and both ends, and keeps a schema-2 diagram at 2', async ({ page }) => {
  const id = await createFromQuickStart(page, 'Flowchart');
  await expect(page.locator('.react-flow__edge')).toHaveCount(6);
  await page.locator('.react-flow__edge').first().click({ force: true });
  const format = page.getByRole('complementary', { name: 'Format' });
  await format.getByRole('combobox', { name: 'Connector notation' }).selectOption({ label: 'BPMN message flow' });
  await expect
    .poll(async () => {
      const c = await stored(page, id);
      const e = c.edges.find((x) => x.data.startMarker === 'circle');
      return e ? [e.data.dashed, e.data.endMarker, c.schemaVersion] : null;
    })
    .toEqual([true, 'triangle', 2]);
  await expect(format.getByRole('combobox', { name: 'Connector notation' })).toHaveValue('');
  await expect(format.getByRole('combobox', { name: 'Connector notation' }).locator('option').first()).toHaveText('BPMN message flow');
});

test('every category template opens with all its shapes and no errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const expected: Array<[string, number, string]> = [
    ['Mind map (radial)', 14, 'ellipse'],
    ['Business process (BPMN)', 13, 'bpmnPool'],
    ['UML sequence diagram', 18, 'umlLifeline'],
    ['UML activity diagram', 10, 'umlFork'],
    ['UML state diagram', 6, 'umlFinal'],
    ['UML use case diagram', 7, 'umlBoundary'],
    ['Network diagram', 12, 'netRouter'],
  ];
  for (const [name, count, kind] of expected) {
    const id = await createFromTemplate(page, name);
    await expect(page.locator('.react-flow__node')).toHaveCount(count);
    await expect(page.locator('.react-flow__node svg.dcos-shape-svg').first()).toBeVisible();
    // Nothing is drawn as an "unknown shape" placeholder.
    await expect(page.getByText('unknown shape')).toHaveCount(0);
    expect((await stored(page, id)).nodes.some((n) => n.data.shape === kind)).toBe(true);
  }
  expect(errors).toEqual([]);
});
