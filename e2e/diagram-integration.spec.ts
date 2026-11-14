import { expect, test, type Page } from '@playwright/test';
import { inflateSync } from 'node:zlib';
import { downloadBytes, readStore } from './helpers';

/**
 * Phase 5 Round 3: features of different groups used together, in the real app. Each case goes through save and
 * reload, undo, copy and paste, the .drawio round trip (export, then import as a new diagram) and the SVG and PDF
 * exports: a group inside a BPMN lane, a locked shape on a hidden layer, a connector with bend points between grouped
 * shapes, a network icon with a link and properties, and Quick Connect from a BPMN task.
 */

type StoredNode = { id: string; position: { x: number; y: number }; width: number; height: number; parentId?: string; locked?: boolean; hidden?: boolean; layer?: string; data: Record<string, unknown> & { label: string; shape: string } };
type StoredEdge = { id: string; source: string; target: string; data?: { waypoints?: Array<{ x: number; y: number }> } & Record<string, unknown> };
type Content = { schemaVersion: number; nodes: StoredNode[]; edges: StoredEdge[]; layers?: Array<{ id: string; name: string; visible: boolean; locked: boolean }> };
type Stored = { id: string; title: string; content: Content };

const style = { fill: '#ffffff', stroke: '#334155', strokeWidth: 2, textColor: '#0f172a', fontSize: 14, dashed: false, bold: false };
const shape = (id: string, kind: string, x: number, y: number, w: number, h: number, label: string, extra: Record<string, unknown> = {}, data: Record<string, unknown> = {}) => ({
  id,
  position: { x, y },
  width: w,
  height: h,
  data: { ...style, shape: kind, label, ...data },
  ...extra,
});
const connector = (id: string, source: string, target: string, extra: Record<string, unknown> = {}, data: Record<string, unknown> = {}) => ({
  id,
  source,
  target,
  sourceHandle: 'r',
  targetHandle: 'l',
  type: 'smoothstep',
  label: '',
  data: { color: '#475569', width: 2, dashed: false, arrow: 'end', ...data },
  ...extra,
});
const diagram = (nodes: unknown[], edges: unknown[] = [], extra: Record<string, unknown> = {}) => ({ schemaVersion: 3, nodes, edges, viewport: { x: 40, y: 40, zoom: 1 }, settings: { snapToGrid: false, showGrid: true, autoLayout: 'none' }, ...extra });

/** A BPMN pool with one lane, at the canvas origin. */
const pool = () => [shape('pool', 'bpmnPool', 0, 0, 700, 300, 'Pool', {}, { fill: '#f8fafc', bold: true }), shape('lane', 'bpmnLane', 30, 0, 670, 300, 'Lane', { parentId: 'pool' }, { strokeWidth: 1.5, stroke: '#64748b' })];
const task = (id: string, x: number, y: number, label: string, extra: Record<string, unknown> = {}) => shape(id, 'bpmnTask', x, y, 130, 80, label, extra, { fill: '#eff6ff', stroke: '#1d4ed8', fontSize: 13 });

async function importFile(page: Page, name: string, body: string | Buffer) {
  await page.goto('./#/diagrams');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Import diagram file' }).click()]);
  await chooser.setFiles({ name, mimeType: name.endsWith('.drawio') ? 'application/xml' : 'application/json', buffer: Buffer.isBuffer(body) ? body : Buffer.from(body) });
  await expect(page).toHaveURL(/#\/diagrams\/[0-9a-f-]{36}$/);
  await expect(page.locator('.react-flow__node').first()).toBeVisible();
  return page.url().split('/').pop()!;
}
const open = (page: Page, title: string, content: unknown) => importFile(page, `${title}.dcosdiagram`, JSON.stringify({ format: 'dcos-diagram', version: 1, app: 'test', title, diagram: content }));

const stored = async (page: Page, id: string) => (await readStore<Stored>(page, 'diagrams')).find((d) => d.id === id)!.content;
const poll = <T>(page: Page, id: string, pick: (c: Content) => T) => expect.poll(async () => pick(await stored(page, id)), { timeout: 10_000 });
const node = (page: Page, id: string) => page.locator(`.react-flow__node[data-id="${id}"]`);
const pane = (page: Page) => page.locator('.react-flow__pane').click({ position: { x: 5, y: 5 } });

async function exportBytes(page: Page, item: RegExp) {
  await page.getByRole('button', { name: 'Export' }).click();
  const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: item }).click()]);
  return downloadBytes(file);
}
/** The text drawn in a PDF (Helvetica Tj strings), from its compressed content streams. */
function pdfText(bytes: Buffer) {
  const raw = bytes.toString('latin1');
  expect(raw.startsWith('%PDF')).toBe(true);
  expect(raw).not.toMatch(/\/Subtype\s*\/Image/); // vector, not a picture of the diagram
  let out = '';
  for (const m of raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    try {
      out += inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1');
    } catch {
      out += m[1];
    }
  }
  return out;
}
/** Imports an exported .drawio as a new diagram and returns what was stored. */
async function drawioRoundTrip(page: Page, xml: Buffer) {
  const id = await importFile(page, 'Round trip.drawio', xml);
  return poll(page, id, (c) => c.nodes.length).toBeGreaterThan(0).then(() => stored(page, id));
}

test('a group inside a BPMN lane: group, reload, undo, copy and paste, .drawio round trip, SVG and PDF', async ({ page }) => {
  const id = await open(page, 'Lane group', diagram([...pool(), task('t1', 40, 40, 'One', { parentId: 'lane' }), task('t2', 240, 40, 'Two', { parentId: 'lane' })], [connector('e1', 't1', 't2')]));
  // Shapes in a lane select directly (a lane is a container, not a group).
  await node(page, 't1').click();
  await node(page, 't2').click({ modifiers: ['Shift'] });
  await page.keyboard.press('ControlOrMeta+g');
  await poll(page, id, (c) => c.nodes.filter((n) => n.data.shape === 'group').map((g) => g.parentId)).toEqual(['lane']);
  const groupId = (await stored(page, id)).nodes.find((n) => n.data.shape === 'group')!.id;
  expect((await stored(page, id)).nodes.filter((n) => n.parentId === groupId).map((n) => n.id)).toEqual(['t1', 't2']);

  // Undo and redo (the history lives in the open editor).
  await page.keyboard.press('ControlOrMeta+z');
  await poll(page, id, (c) => c.nodes.some((n) => n.data.shape === 'group')).toBe(false);
  await poll(page, id, (c) => c.nodes.filter((n) => n.parentId === 'lane').map((n) => n.id)).toEqual(['t1', 't2']);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await poll(page, id, (c) => c.nodes.find((n) => n.data.shape === 'group')?.parentId).toBe('lane');

  // Reload: unchanged.
  const before = await stored(page, id);
  await page.reload();
  await expect(node(page, 't1')).toBeVisible();
  expect(await stored(page, id)).toEqual(before);

  // Copy and paste the group: the copy lands in the lane too, with its shapes and the connector between them.
  await pane(page);
  await node(page, 't1').click(); // first click selects the group
  await expect(node(page, groupId)).toHaveClass(/selected/);
  await page.keyboard.press('ControlOrMeta+c');
  await page.keyboard.press('ControlOrMeta+v');
  await poll(page, id, (c) => c.nodes.filter((n) => n.data.shape === 'group').map((g) => g.parentId)).toEqual(['lane', 'lane']);
  const afterPaste = await stored(page, id);
  const copy = afterPaste.nodes.find((n) => n.data.shape === 'group' && n.id !== groupId)!;
  expect(afterPaste.nodes.filter((n) => n.parentId === copy.id).map((n) => n.data.label)).toEqual(['One', 'Two']);
  expect(afterPaste.edges).toHaveLength(2);

  // diagrams.net: both groups are written inside the lane, and come back as groups in a lane.
  const xml = await exportBytes(page, /\.drawio/);
  expect(xml.toString('utf8').match(/style="group;[^"]*"[^>]*parent="lane"/g)).toHaveLength(2);
  const svg = (await exportBytes(page, /^SVG image/)).toString('utf8');
  expect(svg).not.toContain('foreignObject');
  expect(svg.match(/>One</g)).toHaveLength(2);
  const pdf = pdfText(await exportBytes(page, /^PDF/));
  expect(pdf).toMatch(/\(One\)\s*Tj/);
  expect(pdf).toMatch(/\(Two\)\s*Tj/);
  const back = await drawioRoundTrip(page, xml);
  expect(back.nodes.filter((n) => n.data.shape === 'group').map((g) => g.parentId)).toEqual(['lane', 'lane']);
  expect(back.nodes.find((n) => n.id === 'lane')!.data.shape).toBe('bpmnLane');
});

test('a locked shape on a hidden layer: not drawn, selected or exported; shown, it stays locked; reload, undo, paste, .drawio', async ({ page }) => {
  const layers = [
    { id: 'base', name: 'Base', visible: true, locked: false },
    { id: 'answers', name: 'Answers', visible: false, locked: false },
  ];
  const id = await open(page, 'Hidden answers', diagram([shape('q', 'rectangle', 0, 0, 160, 70, 'Question', { layer: 'base' }), shape('secret', 'rounded', 300, 0, 160, 70, 'Answer', { layer: 'answers', locked: true })], [connector('e1', 'q', 'secret')], { layers }));
  await expect(node(page, 'q')).toBeVisible();
  await expect(node(page, 'secret')).toHaveCount(0);
  await node(page, 'q').click();
  await page.keyboard.press('ControlOrMeta+a');
  await expect(page.locator('.react-flow__node.selected')).toHaveCount(1);
  await expect(page.locator('.react-flow__edge')).toHaveCount(0);

  await exportBytes(page, /^SVG image/);
  await expect(page.getByText(/1 shape on a hidden layer was left out\. 1 connector to a shape that is not shown was left out\./)).toBeVisible();
  expect(pdfText(await exportBytes(page, /^PDF/))).not.toMatch(/\(Answer\)/);
  const xml = (await exportBytes(page, /\.drawio/)).toString('utf8');
  expect(xml).toMatch(/<mxCell id="answers" value="Answers"[^>]*visible="0"/);
  expect(xml).toMatch(/<mxCell id="secret"[^>]*style="[^"]*locked=1;/);

  // Show the layer: the shape is drawn, locked (no delete, no move), and an undo hides the layer again.
  await page.getByRole('button', { name: 'Layers' }).click();
  await page.getByRole('region', { name: 'Layers' }).getByRole('button', { name: 'Show Answers' }).click();
  await expect(node(page, 'secret')).toBeVisible();
  await expect(node(page, 'secret')).toHaveClass(/dcos-locked/);
  await node(page, 'secret').click();
  await page.keyboard.press('Delete');
  const b = (await node(page, 'secret').boundingBox())!;
  await page.mouse.move(b.x + 20, b.y + 20);
  await page.mouse.down();
  await page.mouse.move(b.x + 120, b.y + 120, { steps: 5 });
  await page.mouse.up();
  await poll(page, id, (c) => c.layers?.find((l) => l.id === 'answers')?.visible).toBe(true);
  expect((await stored(page, id)).nodes.find((n) => n.id === 'secret')).toMatchObject({ position: { x: 300, y: 0 }, locked: true, layer: 'answers' });

  // Copy and paste keeps the lock and the layer.
  await page.keyboard.press('ControlOrMeta+c');
  await page.keyboard.press('ControlOrMeta+v');
  await poll(page, id, (c) => c.nodes.filter((n) => n.data.label === 'Answer').map((n) => [n.locked, n.layer])).toEqual([
    [true, 'answers'],
    [true, 'answers'],
  ]);
  await page.keyboard.press('ControlOrMeta+z'); // the paste
  await page.keyboard.press('ControlOrMeta+z'); // showing the layer
  await poll(page, id, (c) => [c.nodes.length, c.layers?.find((l) => l.id === 'answers')?.visible]).toEqual([2, false]);
  await page.reload();
  await expect(node(page, 'q')).toBeVisible();
  await expect(node(page, 'secret')).toHaveCount(0);

  // diagrams.net round trip: the layer comes back hidden and the shape locked.
  const back = await drawioRoundTrip(page, Buffer.from(xml));
  expect(back.layers).toEqual(layers);
  expect(back.nodes.find((n) => n.id === 'secret')).toMatchObject({ locked: true, layer: 'answers' });
});

test('a connector with bend points between grouped shapes: the bends travel with the group, undo, paste, reload, exports', async ({ page }) => {
  const bends = [
    { x: 200, y: 35 },
    { x: 200, y: 165 },
  ];
  const id = await open(
    page,
    'Bent in a group',
    diagram([shape('g', 'group', 0, 0, 400, 200, '', {}, { fill: 'transparent', stroke: 'transparent', strokeWidth: 0 }), shape('a', 'rectangle', 0, 0, 140, 70, 'A', { parentId: 'g' }), shape('b', 'rectangle', 260, 130, 140, 70, 'B', { parentId: 'g' }), shape('c', 'rectangle', 600, 0, 140, 70, 'C')], [connector('e1', 'a', 'b', { type: 'step' }, { waypoints: bends })]),
  );
  // Drag shape a: the whole group moves (diagrams.net), and so do the bends of the connector inside it.
  const box = (await node(page, 'a').boundingBox())!;
  await page.mouse.move(box.x + 30, box.y + 30);
  await page.mouse.down();
  await page.mouse.move(box.x + 130, box.y + 80, { steps: 8 });
  await page.mouse.up();
  await poll(page, id, (c) => c.nodes.find((n) => n.id === 'g')!.position.x).toBeGreaterThan(50);
  const moved = await stored(page, id);
  const g = moved.nodes.find((n) => n.id === 'g')!.position;
  expect(g.x).toBeCloseTo(100, -1);
  expect(g.y).toBeCloseTo(50, -1);
  expect(moved.edges[0].data!.waypoints).toEqual(bends.map((p) => ({ x: p.x + g.x, y: p.y + g.y })));
  // The drawn connector still passes through its bends.
  const d = await page.locator('.react-flow__edge[data-id="e1"] path.react-flow__edge-path').first().getAttribute('d');
  const pts = [...(d ?? '').matchAll(/(-?[\d.]+)[ ,](-?[\d.]+)/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]) }));
  for (const w of moved.edges[0].data!.waypoints!) expect(pts.some((p) => Math.abs(p.x - w.x) < 1.5 && Math.abs(p.y - w.y) < 1.5)).toBe(true);

  // Undo puts the group and the bends back together.
  await page.keyboard.press('ControlOrMeta+z');
  await poll(page, id, (c) => [c.nodes.find((n) => n.id === 'g')!.position, c.edges[0].data!.waypoints]).toEqual([{ x: 0, y: 0 }, bends]);

  // Paste a copy of the group: its connector's bends move with it.
  await pane(page);
  await node(page, 'a').click();
  await page.keyboard.press('ControlOrMeta+c');
  await page.keyboard.press('ControlOrMeta+v');
  await poll(page, id, (c) => c.edges.length).toBe(2);
  const afterPaste = await stored(page, id);
  const pasted = afterPaste.edges.find((e) => e.id !== 'e1')!;
  const copyGroup = afterPaste.nodes.find((n) => n.data.shape === 'group' && n.id !== 'g')!.position;
  expect(copyGroup.x).toBeGreaterThan(0);
  expect(pasted.data!.waypoints).toEqual(bends.map((p) => ({ x: p.x + copyGroup.x, y: p.y + copyGroup.y })));
  await page.reload();
  await expect(node(page, 'a')).toBeVisible();
  expect((await stored(page, id)).edges.find((e) => e.id === 'e1')!.data!.waypoints).toEqual(bends);

  // Exports: the bends are in the .drawio file and on the SVG path.
  const xml = (await exportBytes(page, /\.drawio/)).toString('utf8');
  expect(xml).toMatch(/<mxCell id="e1"[^>]*>(?:(?!<\/mxCell>)[\s\S])*<Array as="points"><mxPoint x="200" y="35" ?\/><mxPoint x="200" y="165" ?\/><\/Array>/);
  const svg = (await exportBytes(page, /^SVG image/)).toString('utf8');
  const path = /<g data-edge-id="e1"><path d="([^"]+)"/.exec(svg)![1];
  for (const w of bends) expect(path).toMatch(new RegExp(`${w.x}[ ,]${w.y}\\b`));
  pdfText(await exportBytes(page, /^PDF/));
  const back = await drawioRoundTrip(page, Buffer.from(xml));
  expect(back.edges.find((e) => e.id === 'e1')!.data!.waypoints).toEqual(bends);
  expect(back.nodes.find((n) => n.id === 'a')!.parentId).toBe('g');
});

test('a network icon with a link and properties: added from the library, edited, reload, undo, paste, exports', async ({ page }) => {
  const id = await open(page, 'Network', diagram([shape('pc', 'rectangle', 0, 0, 140, 70, 'Lab PC')], [], { schemaVersion: 2 }));
  const library = page.getByRole('complementary', { name: 'Shapes' });
  await library.getByRole('searchbox', { name: 'Search shapes' }).fill('server');
  await library.getByRole('button', { name: /^Server/ }).click();
  await poll(page, id, (c) => c.nodes.find((n) => n.data.shape === 'netServer')?.id).toBeTruthy();
  const serverId = (await stored(page, id)).nodes.find((n) => n.data.shape === 'netServer')!.id;
  await expect(node(page, serverId)).toHaveClass(/selected/);
  const format = page.getByRole('complementary', { name: 'Format' });
  await format.getByRole('textbox', { name: 'Link' }).fill('https://example.com/server?x=1&y=2');
  await format.getByRole('textbox', { name: 'New property name' }).fill('ip');
  await format.getByRole('textbox', { name: 'New property value' }).fill('10.0.0.5');
  await format.getByRole('button', { name: 'Add property' }).click();
  await poll(page, id, (c) => c.nodes.find((n) => n.id === serverId)!.data).toMatchObject({ link: 'https://example.com/server?x=1&y=2', properties: { ip: '10.0.0.5' } });
  expect((await stored(page, id)).schemaVersion).toBe(3);

  // Undo the property, redo it.
  await node(page, serverId).click();
  await page.keyboard.press('ControlOrMeta+z');
  await poll(page, id, (c) => c.nodes.find((n) => n.id === serverId)!.data.properties).toBeUndefined();
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await poll(page, id, (c) => c.nodes.find((n) => n.id === serverId)!.data.properties).toEqual({ ip: '10.0.0.5' });

  // Reload; copy and paste keeps the kind, link and properties.
  await page.reload();
  await expect(node(page, serverId)).toBeVisible();
  await node(page, serverId).click();
  await page.keyboard.press('ControlOrMeta+c');
  await page.keyboard.press('ControlOrMeta+v');
  await poll(page, id, (c) => c.nodes.filter((n) => n.data.shape === 'netServer').map((n) => [n.data.link, n.data.properties])).toEqual([
    ['https://example.com/server?x=1&y=2', { ip: '10.0.0.5' }],
    ['https://example.com/server?x=1&y=2', { ip: '10.0.0.5' }],
  ]);

  // Exports: a UserObject in diagrams.net with the network stencil; a link in the SVG and the PDF; a note for PNG.
  const xml = (await exportBytes(page, /\.drawio/)).toString('utf8');
  expect(xml).toMatch(new RegExp(`<UserObject label="Server" link="https://example.com/server\\?x=1&amp;y=2" ip="10.0.0.5" id="${serverId}"><mxCell style="shape=mxgraph\\.networks\\.server;`));
  const svg = (await exportBytes(page, /^SVG image/)).toString('utf8');
  expect(svg).toContain('href="https://example.com/server?x=1&amp;y=2"');
  const pdf = (await exportBytes(page, /^PDF/)).toString('latin1');
  expect(pdf).toMatch(/\/URI \(https:\/\/example\.com\/server\?x=1&y=2\)/);
  await exportBytes(page, /^PNG/);
  await expect(page.getByText(/2 links cannot be kept in a PNG image/)).toBeVisible();
  const back = await drawioRoundTrip(page, Buffer.from(xml));
  expect(back.nodes.find((n) => n.id === serverId)!.data).toMatchObject({ shape: 'netServer', link: 'https://example.com/server?x=1&y=2', properties: { ip: '10.0.0.5' } });
});

test('Quick Connect from a BPMN task in a lane: the new task joins the lane, connected; undo, reload, paste, exports', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  const id = await open(page, 'Quick task', diagram([...pool(), task('t1', 60, 100, 'Write', { parentId: 'lane' })]));
  await node(page, 't1').click();
  await page.getByRole('button', { name: 'Add a connected shape to the right' }).click();
  await poll(page, id, (c) => c.nodes.length).toBe(4);
  const made = (await stored(page, id)).nodes.find((n) => !['pool', 'lane', 't1'].includes(n.id))!;
  expect(made).toMatchObject({ parentId: 'lane', data: { shape: 'bpmnTask' } });
  expect((await stored(page, id)).edges).toEqual([expect.objectContaining({ source: 't1', target: made.id })]);
  // It is to the right of the task, inside the lane on the canvas.
  const lane = (await node(page, 'lane').boundingBox())!;
  const nb = (await node(page, made.id).boundingBox())!;
  const tb = (await node(page, 't1').boundingBox())!;
  expect(nb.x).toBeGreaterThan(tb.x + tb.width);
  expect(nb.x + nb.width).toBeLessThanOrEqual(lane.x + lane.width + 1);

  await page.keyboard.press('ControlOrMeta+z');
  await poll(page, id, (c) => [c.nodes.length, c.edges.length]).toEqual([3, 0]);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await poll(page, id, (c) => [c.nodes.length, c.edges.length]).toEqual([4, 1]);
  await page.reload();
  await expect(node(page, made.id)).toBeVisible();

  // Copy both tasks and paste: the copies land in the lane, joined.
  await node(page, 't1').click();
  await node(page, made.id).click({ modifiers: ['Shift'] });
  await page.keyboard.press('ControlOrMeta+c');
  await page.keyboard.press('ControlOrMeta+v');
  await poll(page, id, (c) => c.nodes.filter((n) => n.data.shape === 'bpmnTask').map((n) => n.parentId)).toEqual(['lane', 'lane', 'lane', 'lane']);
  expect((await stored(page, id)).edges).toHaveLength(2);

  const xml = await exportBytes(page, /\.drawio/);
  expect(xml.toString('utf8').match(/dcosShape=bpmnTask;[^"]*"[^>]*parent="lane"/g)).toHaveLength(4);
  const svg = (await exportBytes(page, /^SVG image/)).toString('utf8');
  expect(svg.match(/>Write</g)?.length).toBeGreaterThanOrEqual(2);
  expect(pdfText(await exportBytes(page, /^PDF/))).toMatch(/\(Write\)\s*Tj/);
  const back = await drawioRoundTrip(page, xml);
  expect(back.nodes.filter((n) => n.data.shape === 'bpmnTask').map((n) => n.parentId)).toEqual(['lane', 'lane', 'lane', 'lane']);
});
