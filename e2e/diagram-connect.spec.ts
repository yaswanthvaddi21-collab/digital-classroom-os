import { expect, test, type Page } from './fixtures';
import { createFromQuickStart, readStore } from './helpers';

// Phase 5 G-CONNECT: floating connections, fixed connection points, bend points and connector labels.

type Pt = { x: number; y: number };
type StoredEdge = { id: string; source: string; target: string; sourceHandle: string | null; targetHandle: string | null; type: string; label: string; data: Record<string, unknown> & { waypoints?: Pt[]; labelPosition?: number; sourcePort?: unknown; targetPort?: unknown } };
type StoredDiagram = { id: string; content: { schemaVersion: number; nodes: Array<{ id: string; position: Pt; width: number; height: number }>; edges: StoredEdge[] } };

const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
const node = (page: Page, id: string) => page.locator(`.react-flow__node[data-id="${id}"]`);
const edgeEl = (page: Page, id: string) => page.locator(`.react-flow__edge[data-id="${id}"]`);

async function content(page: Page, id: string) {
  return (await readStore<StoredDiagram>(page, 'diagrams')).find((d) => d.id === id)!.content;
}
async function storedEdge(page: Page, id: string, edgeId: string) {
  return (await content(page, id)).edges.find((e) => e.id === edgeId);
}

/** Points along a connector's drawn path, in page coordinates. */
async function along(page: Page, edgeId: string, fractions: number[]): Promise<Pt[]> {
  await expect(edgeEl(page, edgeId).locator('path.react-flow__edge-path')).toBeAttached();
  return page.evaluate(
    ([id, ts]) => {
      const p = document.querySelector(`.react-flow__edge[data-id="${id}"] path.react-flow__edge-path`) as SVGPathElement;
      const m = p.getScreenCTM()!;
      const len = p.getTotalLength();
      return ts.map((t) => {
        const q = p.getPointAtLength(len * t);
        return { x: q.x * m.a + q.y * m.c + m.e, y: q.x * m.b + q.y * m.d + m.f };
      });
    },
    [edgeId, fractions] as const,
  );
}

/** The `d` of a connector's path as its list of points (the M/L paths of straight and orthogonal lines). */
async function polyline(page: Page, edgeId: string): Promise<Pt[]> {
  const d = (await edgeEl(page, edgeId).locator('path.react-flow__edge-path').getAttribute('d'))!;
  return [...d.matchAll(/[ML]\s*(-?[\d.]+)[ ,](-?[\d.]+)/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]) }));
}

async function selectEdge(page: Page, edgeId: string, t = 0.3) {
  const [p] = await along(page, edgeId, [t]);
  await page.mouse.click(p.x, p.y);
  await expect(edgeEl(page, edgeId)).toHaveClass(/selected/);
}

async function drag(page: Page, from: Pt, to: Pt) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 6 });
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
}

const centre = async (_page: Page, sel: ReturnType<Page['locator']>) => {
  const b = (await sel.boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2, box: b };
};

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
});

test('a connection dropped on a shape body floats, and re-picks its side as the shape moves', async ({ page }) => {
  const id = await createFromQuickStart(page, 'Flowchart');
  const before = new Set((await content(page, id)).edges.map((e) => e.id));

  // From "Print Even"'s right handle onto the middle of "Print Odd" (away from its handles).
  await node(page, 'even').hover();
  const handle = await centre(page, node(page, 'even').locator('.react-flow__handle[data-handleid="r"]'));
  const odd = await centre(page, node(page, 'odd'));
  await drag(page, handle, odd);
  await expect(page.locator('.react-flow__edge')).toHaveCount(7);
  await expect.poll(async () => (await content(page, id)).edges.length).toBe(7);
  const added = (await content(page, id)).edges.find((e) => !before.has(e.id))!;
  expect(added).toMatchObject({ source: 'even', target: 'odd', sourceHandle: 'r' });
  expect(added.data.targetPort).toBe('perimeter');
  expect((await content(page, id)).schemaVersion).toBe(3);

  // The end touches Print Odd's left side (facing the source).
  const box1 = (await node(page, 'odd').boundingBox())!;
  const [end1] = await along(page, added.id, [1]);
  expect(Math.abs(end1.x - box1.x)).toBeLessThan(2);
  expect(end1.y).toBeGreaterThan(box1.y - 1);
  expect(end1.y).toBeLessThan(box1.y + box1.height + 1);

  // Move Print Odd far below Print Even: the floating end moves round to its top.
  const even = await centre(page, node(page, 'even'));
  await drag(page, odd, { x: even.x, y: even.y + 180 });
  const box2 = (await node(page, 'odd').boundingBox())!;
  const [end2] = await along(page, added.id, [1]);
  expect(Math.abs(end2.y - box2.y)).toBeLessThan(2);
  expect(end2.x).toBeGreaterThan(box2.x - 1);
  expect(end2.x).toBeLessThan(box2.x + box2.width + 1);

  // One undo removes the move, another the connector.
  await page.keyboard.press(`${mod}+z`);
  await page.keyboard.press(`${mod}+z`);
  await expect(page.locator('.react-flow__edge')).toHaveCount(6);
});

test('connection points: the picker on the canvas and the Format panel', async ({ page }) => {
  const id = await createFromQuickStart(page, 'Flowchart');
  await selectEdge(page, 'e-decide-odd');

  // The end grip opens the eight points (plus floating) on the shape the end is attached to.
  await page.getByRole('button', { name: 'End of the connector: choose its connection point' }).click();
  const points = page.getByRole('group', { name: 'Connection points for the end' }).getByRole('button');
  await expect(points).toHaveCount(9);
  await expect(page.getByRole('button', { name: 'Attach the end to the top', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Attach the end to the top-right corner' }).click();
  await expect.poll(async () => (await storedEdge(page, id, 'e-decide-odd'))?.data.targetPort).toEqual({ x: 1, y: 0 });
  const box = (await node(page, 'odd').boundingBox())!;
  const [end] = await along(page, 'e-decide-odd', [1]);
  expect(Math.hypot(end.x - (box.x + box.width), end.y - box.y)).toBeLessThan(6); // the corner of the rounded box

  // The Format panel offers the same choices (keyboard reachable).
  const start = page.getByRole('combobox', { name: 'Start attaches at' });
  await expect(page.getByRole('combobox', { name: 'End attaches at' })).toHaveValue('top-right');
  await start.selectOption('perimeter');
  await expect.poll(async () => (await storedEdge(page, id, 'e-decide-odd'))?.data.sourcePort).toBe('perimeter');
  await page.getByRole('combobox', { name: 'End attaches at' }).selectOption('top');
  await start.selectOption('right');
  await expect.poll(async () => (await storedEdge(page, id, 'e-decide-odd'))?.data.sourcePort ?? 'none').toBe('none');
  const back = (await storedEdge(page, id, 'e-decide-odd'))!;
  expect(back).toMatchObject({ sourceHandle: 'r', targetHandle: 't' });
  expect(back.data.sourcePort).toBeUndefined();
  expect(back.data.targetPort).toBeUndefined();
  // Only side points are used again, so the diagram is schema 2 (older builds can edit it).
  await expect.poll(async () => (await content(page, id)).schemaVersion).toBe(2);

  // Dragging an end grip onto another shape reattaches it there, floating.
  await selectEdge(page, 'e-decide-odd');
  const grip = await centre(page, page.getByRole('button', { name: 'End of the connector: choose its connection point' }));
  const endShape = await centre(page, node(page, 'end'));
  await drag(page, grip, endShape);
  await expect.poll(async () => await storedEdge(page, id, 'e-decide-odd')).toMatchObject({ target: 'end', data: { targetPort: 'perimeter' } });
});

test('bend points: drag to add, keep right angles, move by keyboard, double-click to remove; undo', async ({ page }) => {
  const id = await createFromQuickStart(page, 'Flowchart');
  await selectEdge(page, 'e-even-end');
  await page.getByRole('combobox', { name: 'Line shape' }).selectOption('step');
  await expect.poll(async () => (await storedEdge(page, id, 'e-even-end'))?.type).toBe('step');

  const add = await centre(page, page.getByRole('button', { name: 'Add a bend point to part 1 of the connector' }));
  await drag(page, add, { x: add.x - 70, y: add.y - 50 });
  await expect.poll(async () => (await storedEdge(page, id, 'e-even-end'))?.data.waypoints?.length).toBe(1);
  const pts = await polyline(page, 'e-even-end');
  expect(pts.length).toBeGreaterThan(3);
  for (let i = 1; i < pts.length; i++) expect(Math.abs(pts[i].x - pts[i - 1].x) < 0.01 || Math.abs(pts[i].y - pts[i - 1].y) < 0.01, JSON.stringify(pts)).toBe(true);

  // A second bend on the second stretch, then move the first with the arrow keys (snapped to the 10 px grid).
  await expect(page.getByRole('button', { name: /Add a bend point to part/ })).toHaveCount(2);
  const first = (await storedEdge(page, id, 'e-even-end'))!.data.waypoints![0];
  const bend = page.getByRole('button', { name: 'Bend point 1 of 1' });
  await bend.focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await storedEdge(page, id, 'e-even-end'))?.data.waypoints?.[0]).toEqual({ x: first.x + 20, y: first.y });

  // Moving both shapes together carries the bend along.
  await page.keyboard.press('Escape');
  await node(page, 'even').click();
  await node(page, 'end').click({ modifiers: ['Shift'] });
  const nodePos = async (nid: string) => (await content(page, id)).nodes.find((n) => n.id === nid)!.position;
  const evenBefore = await nodePos('even');
  const endBefore = await nodePos('end');
  const from = await centre(page, node(page, 'even'));
  await drag(page, from, { x: from.x + 50, y: from.y + 30 });
  await expect.poll(async () => (await nodePos('even')).x).not.toBe(evenBefore.x);
  const evenAfter = await nodePos('even');
  const dx = evenAfter.x - evenBefore.x;
  const dy = evenAfter.y - evenBefore.y;
  expect(await nodePos('end')).toEqual({ x: endBefore.x + dx, y: endBefore.y + dy }); // both shapes moved
  await expect.poll(async () => (await storedEdge(page, id, 'e-even-end'))?.data.waypoints?.[0]).toEqual({ x: first.x + 20 + dx, y: first.y + dy });

  // Double-click removes it; the connector is plain again.
  await selectEdge(page, 'e-even-end', 0.1);
  await page.getByRole('button', { name: 'Bend point 1 of 1' }).dblclick();
  await expect.poll(async () => (await storedEdge(page, id, 'e-even-end'))?.data).not.toHaveProperty('waypoints');

  await page.keyboard.press(`${mod}+z`);
  await expect.poll(async () => (await storedEdge(page, id, 'e-even-end'))?.data.waypoints?.length).toBe(1);
});

test('connector labels: double-click to edit, F2, drag along the line', async ({ page }) => {
  const id = await createFromQuickStart(page, 'Flowchart');
  const [mid] = await along(page, 'e-input-decide', [0.5]);
  await page.mouse.dblclick(mid.x, mid.y);
  const editor = page.getByRole('textbox', { name: 'Connector label' });
  await expect(editor).toBeFocused();
  await editor.fill('Valid');
  await page.keyboard.press('Enter');
  await expect(editor).toHaveCount(0);
  await expect(edgeEl(page, 'e-input-decide').locator('.react-flow__edge-text')).toHaveText('Valid');
  await expect.poll(async () => (await storedEdge(page, id, 'e-input-decide'))?.label).toBe('Valid');

  // Escape keeps the old text.
  await selectEdge(page, 'e-decide-odd', 0.2);
  await page.keyboard.press('F2');
  await expect(page.getByRole('textbox', { name: 'Connector label' })).toHaveValue('No');
  await page.keyboard.type('pe');
  await page.keyboard.press('Escape');
  await expect(edgeEl(page, 'e-decide-odd').locator('.react-flow__edge-text')).toHaveText('No');

  // Drag the "No" label towards the start of its connector.
  const label = await centre(page, edgeEl(page, 'e-decide-odd').locator('.react-flow__edge-textwrapper'));
  const [nearStart] = await along(page, 'e-decide-odd', [0.1]);
  await drag(page, label, nearStart);
  await expect.poll(async () => (await storedEdge(page, id, 'e-decide-odd'))?.data.labelPosition ?? 0.5).toBeLessThan(0.25);
  const moved = await centre(page, edgeEl(page, 'e-decide-odd').locator('.react-flow__edge-textwrapper'));
  expect(Math.hypot(moved.x - nearStart.x, moved.y - nearStart.y)).toBeLessThan(25);
  await expect(page.getByRole('slider', { name: /Label position/ })).toHaveValue(String(Math.round((await storedEdge(page, id, 'e-decide-odd'))!.data.labelPosition! * 100)));
  await page.getByRole('button', { name: 'Middle' }).click();
  await expect.poll(async () => (await storedEdge(page, id, 'e-decide-odd'))?.data.labelPosition ?? 'middle').toBe('middle');
});
