// @vitest-environment jsdom
/**
 * The diagrams.net import corpus (tests/fixtures/drawio, hand-written; see its README). For each file: what is kept,
 * and the exact note for everything approximated or left out (DS-R1: never silent; DS-R2: hidden content is imported
 * hidden and named; DS-R7: the right reason and plural for dropped connectors). Each imported diagram must also open
 * in the editor's model and survive a .drawio export → import with nothing further lost.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { drawioExportNotes, drawioPages, fromDrawio, toDrawio } from '../../packages/diagram-studio/src/drawio';
import { DRAWIO_SWIMLANE_KINDS } from '../../packages/diagram-studio/src/drawioFeatures';
import { canvasPosition } from '../../packages/diagram-studio/src/model';
import { shapeDef } from '../../packages/diagram-studio/src/shapeRegistry';
import { deserializeDiagram, serializeDiagram, type DiagramContent, type SerializedNode } from '../../packages/diagram-studio/src/types';

const DIR = join(__dirname, '..', 'fixtures', 'drawio');
const read = (name: string) => readFileSync(join(DIR, name), 'utf8');
const load = (name: string, page?: number) => fromDrawio(read(name), { page });
const byId = (c: DiagramContent) => Object.fromEntries(c.nodes.map((n) => [n.id, n])) as Record<string, SerializedNode>;
const edge = (c: DiagramContent, id: string) => c.edges.find((e) => e.id === id)!;
const canvas = (c: DiagramContent, id: string) => {
  const m = new Map(c.nodes.map((n) => [n.id, n]));
  return canvasPosition(m.get(id)!, m);
};
/** The stored form after opening in the editor and saving. */
const saved = (c: DiagramContent) => {
  const s = deserializeDiagram(c);
  return serializeDiagram(s.nodes, s.edges, null, s.settings, s.layers);
};

describe('links, tooltips and custom properties', () => {
  const { content, report } = load('links-properties.drawio');
  const n = byId(content);

  it('keeps links, tooltips and properties, and fills in placeholders', () => {
    expect(n.syl.data).toMatchObject({ label: 'Syllabus', link: 'https://example.com/syllabus', tooltip: 'Course outline for term 2' });
    expect(n.course.data.label).toBe('Physics (4 credits)');
    expect(n.course.data.properties).toEqual({ subject: 'Physics', credits: '4', teacher: 'Ms. Rao', room: 'B-12' });
    expect(n.pagelink.data.link).toBe('data:page/id,p2');
  });

  it('never keeps a link that is not a web or mail address', () => {
    expect(n.bad.data.link).toBeUndefined();
    expect(n.bad.data.label).toBe('Run me');
  });

  it('names each thing it could not keep', () => {
    expect(report.notes).toEqual([
      '1 link that was not a web or mail address was left out.',
      '1 link leads to another page of the file, which was not imported.',
      'Links, tooltips or custom properties on 1 connector were left out: connectors cannot hold them here.',
      'The text of 1 shape showed property values; it was imported with the values filled in.',
    ]);
  });
});

describe('groups and containers', () => {
  const { content, report } = load('groups-containers.drawio');
  const n = byId(content);

  it('imports groups as groups, nested, with shapes inside them at the same canvas positions', () => {
    expect(n.g1.data.shape).toBe('group');
    expect(n.g2).toMatchObject({ parentId: 'g1', data: { shape: 'group' } });
    expect(n.a).toMatchObject({ parentId: 'g1', position: { x: 0, y: 0 } });
    expect(n.b).toMatchObject({ parentId: 'g2', position: { x: 20, y: 20 } });
    expect(canvas(content, 'b')).toEqual({ x: 280, y: 180 });
    // Parents come before their children (React Flow needs it).
    const order = content.nodes.map((x) => x.id);
    expect(order.indexOf('g1')).toBeLessThan(order.indexOf('g2'));
    expect(order.indexOf('g2')).toBeLessThan(order.indexOf('b'));
  });

  it('keeps a container holding its shapes, and connectors to a group (DS-R7)', () => {
    expect(n.tool).toMatchObject({ parentId: 'box', position: { x: 40, y: 50 } });
    expect(n.box.data).toMatchObject({ shape: 'rectangle', label: 'Toolbox', verticalAlign: 'top' });
    expect(edge(content, 'e1')).toMatchObject({ source: 'g1', target: 'box' });
    expect(edge(content, 'e2')).toMatchObject({ source: 'a', target: 'b' });
  });

  it('opens a collapsed container at its full size, and says so', () => {
    expect(n.fold).toMatchObject({ width: 240, height: 160 });
    expect(n.inside.parentId).toBe('fold');
    expect(report.notes).toEqual(['1 collapsed container was imported expanded.']);
  });
});

describe('layers and hidden content (DS-R2)', () => {
  const { content, report } = load('layers-hidden.drawio');
  const n = byId(content);

  it('imports every layer with its name, visibility and lock, and puts each shape on its layer', () => {
    expect(content.layers).toEqual([
      { id: '1', name: 'Questions', visible: true, locked: false },
      { id: 'ans', name: 'Answers', visible: false, locked: false },
      { id: 'notes', name: 'Teacher notes', visible: true, locked: true },
    ]);
    expect([n.q1.layer, n.a1.layer, n.n1.layer, n.hgchild.layer]).toEqual(['1', 'ans', 'notes', '1']);
  });

  it('imports hidden shapes hidden (and the shapes in a hidden group), never visible', () => {
    expect(n.hint.hidden).toBe(true);
    expect(n.hg.hidden).toBe(true);
    expect(n.hgchild.hidden).toBe(true);
    expect(n.q1.hidden).toBeUndefined();
    // On a hidden layer, a shape is hidden by its layer, not by its own flag (showing the layer shows it).
    expect(n.a1.hidden).toBeUndefined();
  });

  it('names the hidden shapes and layers, and the connectors it cannot hide', () => {
    expect(report.notes).toEqual([
      '3 shapes hidden in the file were imported hidden: “Hint: think of 7 x 7”, “Draft” and 1 without text. “Show hidden shapes” in the Layers panel shows them.',
      'The layer “Answers” is hidden in the file, so it was imported as a hidden layer.',
      '1 connector hidden in the file was imported visible, because connectors cannot be hidden here (“secret link”).',
      '1 connector on a hidden layer is shown, because connectors have no layer here.',
    ]);
  });
});

describe('styles and text', () => {
  const { content, report } = load('styles-text.drawio');
  const n = byId(content);

  it('keeps rotation, opacity, font family, alignment, locks and whole-label bold', () => {
    expect(n.rot.data.rotation).toBe(30);
    expect(n.faint.data).toMatchObject({ opacity: 40, fill: '#dae8fc' });
    expect(n.font.data).toMatchObject({ fontFamily: 'Georgia', textAlign: 'left', verticalAlign: 'top' });
    expect(n.right.data).toMatchObject({ textAlign: 'right', verticalAlign: 'bottom', bold: true });
    expect(n.allbold.data).toMatchObject({ label: 'Heading', bold: true });
    expect(n.lock.locked).toBe(true);
    expect(n.rich.data.label).toBe('Mix of bold and red');
  });

  it('moves text from outside a shape to the inside edge it was nearest', () => {
    expect(n.out.data).toMatchObject({ label: 'Below', verticalAlign: 'bottom' });
  });

  it('names each style it cannot draw', () => {
    expect(report.notes).toEqual([
      '1 shape with a gradient fill was imported with a solid fill.',
      'Shadows on 1 shape were left out.',
      '1 shape drawn in sketch style was imported with plain outlines.',
      'The glass effect on 1 shape was left out.',
      'Separate fill, outline or text transparency on 1 shape was left out.',
      'Italic, underlined or struck-through text on 1 shape was imported as plain text.',
      'Formatting inside the text of 1 shape or connector (such as bold words, colours, sizes or lists) was removed; the text was kept.',
      'The text of 1 shape, placed outside the shape in the file, was moved inside it.',
      'Vertical text on 1 shape was written horizontally.',
    ]);
  });
});

describe('connectors', () => {
  const { content, report } = load('connectors.drawio');

  it('keeps bend points as canvas coordinates, also inside a container', () => {
    expect(edge(content, 'bend').data.waypoints).toEqual([
      { x: 250, y: 70 },
      { x: 250, y: 200 },
      { x: 430, y: 200 },
    ]);
    expect(edge(content, 'inner').data.waypoints).toEqual([{ x: 240, y: 440 }]);
  });

  it('keeps label positions along the line', () => {
    expect(edge(content, 'bend').data.labelPosition).toBe(0.25);
    expect(edge(content, 'off').data.labelPosition).toBe(0.6);
    expect(edge(content, 'lbl')).toMatchObject({ label: 'only label', data: { labelPosition: 0.1 } });
    expect(edge(content, 'two').label).toBe('first second');
  });

  it('keeps fixed connection points, and side centres as plain handles', () => {
    const bend = edge(content, 'bend');
    expect(bend).toMatchObject({ sourceHandle: 'r', targetHandle: 't' });
    expect(bend.data.sourcePort).toBeUndefined();
    expect(bend.data.targetPort).toEqual({ x: 0.25, y: 0 });
    expect(edge(content, 'off').sourceHandle).toBe('b');
  });

  it('drops only what it must, with the right reason and plural (DS-R7)', () => {
    expect(content.edges.map((e) => e.id)).toEqual(['bend', 'inner', 'off', 'two', 'lbl']);
    expect(report.notes).toEqual([
      '1 connector not attached to shapes at both ends was left out.',
      'The labels of 1 connector were moved onto the line (their offset from the line was left out).',
      '1 connector had several labels; they were joined into one label each.',
      'Connection-point offsets on 1 connector were left out.',
      '1 locked connector was imported unlocked: connectors cannot be locked here.',
      'Transparency on 1 connector was left out.',
      '1 connector that ends on another connector was left out.',
    ]);
  });
});

describe('swimlanes', () => {
  const saved = { ...DRAWIO_SWIMLANE_KINDS };
  afterEach(() => Object.assign(DRAWIO_SWIMLANE_KINDS, saved));
  const bpmn = !!shapeDef('bpmnPool') && !!shapeDef('bpmnLane');

  it.runIf(bpmn)('imports pools and lanes as BPMN containers holding their shapes (G-SHAPES kinds registered)', () => {
    const { content, report } = load('swimlanes.drawio');
    const n = byId(content);
    expect([n.pool.data.shape, n.lane1.data.shape, n.lane2.data.shape, n.top.data.shape]).toEqual(['bpmnPool', 'bpmnLane', 'bpmnLane', 'bpmnLane']);
    expect([n.lane1.parentId, n.apply.parentId, n.review.parentId, n.lend.parentId]).toEqual(['pool', 'lane1', 'lane2', 'top']);
    expect(n.lane1.data.fill).toBe('#dae8fc');
    expect(canvas(content, 'apply')).toEqual({ x: 100, y: 70 });
    expect(report.notes).toEqual(['1 swimlane has its title in a band on the left here; in the file the title is at the top.']);
  });

  it('falls back to outline containers when no pool or lane kind is registered', () => {
    Object.assign(DRAWIO_SWIMLANE_KINDS, { pool: null, lane: null });
    const { content, report } = load('swimlanes.drawio');
    const n = byId(content);
    expect([n.pool.data.shape, n.lane1.data.shape, n.top.data.shape]).toEqual(['rectangle', 'rectangle', 'rectangle']);
    expect(n.pool.data).toMatchObject({ fill: 'transparent', textAlign: 'left' });
    expect(n.top.data).toMatchObject({ fill: 'transparent', verticalAlign: 'top' });
    expect(n.apply.parentId).toBe('lane1');
    expect(report.notes).toEqual(['4 swimlanes were imported as an outline that holds its shapes: the title band and the lane colour are not drawn.']);
  });
});

describe('tables, pictures and pages', () => {
  it('imports a table as an entity with one line per row', () => {
    const { content, report } = load('tables.drawio');
    expect(byId(content).t.data).toMatchObject({ shape: 'erEntity', label: 'Student\nPK student_id\nname' });
    expect(edge(content, 'rel')).toMatchObject({ source: 't', target: 'class' });
    expect(report.notes).toEqual(['Tables were imported as entities: the cells of each row became one line of text.']);
  });

  it('keeps embedded pictures, and never fetches one from the web', () => {
    const { content, report } = load('images.drawio');
    const n = byId(content);
    expect(n.png.data).toMatchObject({ shape: 'image', label: 'Logo' });
    expect(n.png.data.image).toMatch(/^data:image\/png;base64,iVBORw0KGgo/);
    expect(n.svg.data.image).toMatch(/^data:image\/svg\+xml;base64,PHN2Zy/);
    expect(n.web.data.shape).toBe('image');
    expect(n.web.data.image).toBeUndefined();
    expect(JSON.stringify(content)).not.toContain('example.com');
    expect(report.notes).toEqual([
      '1 picture inside text was left out.',
      '1 picture linked from the web was imported as an empty frame: the app works offline and does not download pictures.',
      'Icons on 1 shape were left out.',
      '2 pictures stretched to fill their frames in the file are drawn keeping their proportions.',
    ]);
  });

  it('lists the pages, imports the first by default and any page on request, and names the others', () => {
    expect(drawioPages(read('pages.drawio'))).toEqual(['Term 1', 'Term 2', 'Holidays']);
    const first = load('pages.drawio');
    expect(first.report.title).toBe('Term 1');
    expect(first.report.notes).toEqual(['Only the first page (“Term 1”) was imported; the file has 3 pages. The other pages, “Term 2” and “Holidays”, were not imported.']);
    // The second page is compressed, as diagrams.net writes it by default.
    const second = load('pages.drawio', 1);
    expect(second.report.title).toBe('Term 2');
    expect(second.content.nodes.map((x) => x.data.label)).toEqual(['Term 2', 'Exams']);
    expect(second.content.edges).toHaveLength(1);
    expect(second.report.notes).toEqual(['Only page 2 (“Term 2”) was imported; the file has 3 pages. The other pages, “Term 1” and “Holidays”, were not imported.']);
    expect(() => load('pages.drawio', 3)).toThrow(/no page 4/);
  });
});

describe('every corpus file', () => {
  const files = readdirSync(DIR).filter((f) => f.endsWith('.drawio'));

  it.each(files)('%s opens in the editor and survives export → import with nothing further lost', (file) => {
    const first = load(file).content;
    // The editor's stored form is the import itself (nothing is dropped or rewritten on open).
    const stored = saved(first);
    expect(stored.nodes).toEqual(first.nodes);
    expect(stored.edges).toEqual(first.edges);
    expect(stored.layers).toEqual(first.layers);
    expect(drawioExportNotes(first)).toEqual([]);
    const again = fromDrawio(toDrawio(first, 'x')).content;
    expect(again.nodes).toEqual(first.nodes);
    expect(again.edges).toEqual(first.edges);
    expect(again.layers).toEqual(first.layers);
  });
});
