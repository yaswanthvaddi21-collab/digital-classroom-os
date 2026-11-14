// @vitest-environment jsdom
/** G-SHAPES: the category templates are valid, at the right schema, tidy, and their contents sit in their containers. */
import { describe, expect, it } from 'vitest';
import { schemaFor } from '../compat';
import { fromDrawio, toDrawio } from '../drawio';
import { canvasPosition } from '../model';
import { validateDiagram } from '../native';
import { diagramTemplates } from '../templates';
import type { SerializedNode } from '../types';
import { CONTAINER_KINDS, LIBRARY_KINDS } from './kinds';
import { SCHEMA3_TEMPLATES } from './templates';

const build = (id: string) => diagramTemplates.find((t) => t.id === id)!.build();
const box = (n: SerializedNode, all: SerializedNode[]) => ({ ...canvasPosition(n, new Map(all.map((x) => [x.id, x]))), w: n.width, h: n.height });

describe('category templates', () => {
  it('there is a template for every category in the plan', () => {
    const ids = diagramTemplates.map((t) => t.id);
    for (const id of ['flowchart', 'tree', 'mindmap-radial', 'orgchart', 'uml-class', 'uml-sequence', 'uml-activity', 'uml-state', 'uml-usecase', 'er', 'network', 'venn', 'timeline', 'bpmn', 'hierarchy'])
      expect(ids, id).toContain(id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('SCHEMA3_TEMPLATES lists exactly the templates that use Phase 5 shapes', () => {
    for (const t of diagramTemplates) {
      const d = t.build();
      const usesLibrary = d.nodes.some((n) => (LIBRARY_KINDS as readonly string[]).includes(n.data.shape));
      expect(SCHEMA3_TEMPLATES.has(t.id), t.id).toBe(usesLibrary);
      expect(d.schemaVersion, t.id).toBe(usesLibrary ? 3 : 2);
      expect(schemaFor(d), t.id).toBe(d.schemaVersion);
    }
    // The radial mind map uses only existing shapes and curved connectors.
    expect(build('mindmap-radial').schemaVersion).toBe(2);
  });

  it.each(diagramTemplates.map((t) => [t.id]))('%s passes the strict .dcosdiagram validation', (id) => {
    expect(validateDiagram(build(id))).toBeNull();
  });

  it.each(['bpmn', 'uml-usecase'])('%s: every shape in a container lies inside it', (id) => {
    const d = build(id);
    const inContainers = d.nodes.filter((n) => n.parentId);
    expect(inContainers.length).toBeGreaterThan(3);
    for (const n of inContainers) {
      const parent = d.nodes.find((p) => p.id === n.parentId)!;
      expect(CONTAINER_KINDS.has(parent.data.shape), n.id).toBe(true);
      const a = box(n, d.nodes);
      const b = box(parent, d.nodes);
      expect(a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h, `${n.id} in ${parent.id}`).toBe(true);
    }
  });

  it('BPMN: two lanes that fill the pool, and every step in a lane', () => {
    const d = build('bpmn');
    const pool = d.nodes.find((n) => n.data.shape === 'bpmnPool')!;
    const lanes = d.nodes.filter((n) => n.data.shape === 'bpmnLane');
    expect(lanes.map((l) => l.data.label)).toEqual(['Student', 'Teacher']);
    expect(lanes.reduce((s, l) => s + l.height, 0)).toBe(pool.height);
    for (const n of d.nodes.filter((x) => !CONTAINER_KINDS.has(x.data.shape))) expect(lanes.map((l) => l.id), n.id).toContain(n.parentId);
  });

  it.each(['mindmap-radial', 'timeline', 'network', 'uml-activity', 'uml-state'])('%s: no two shapes overlap', (id) => {
    const { nodes } = build(id);
    for (let i = 0; i < nodes.length; i++)
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        const overlap = a.position.x < b.position.x + b.width && b.position.x < a.position.x + a.width && a.position.y < b.position.y + b.height && b.position.y < a.position.y + a.height;
        expect(overlap, `${a.data.label} / ${b.data.label}`).toBe(false);
      }
  });

  it('UML sequence: every message joins activation bars at the same height', () => {
    const d = build('uml-sequence');
    const by = new Map(d.nodes.map((n) => [n.id, n]));
    for (const e of d.edges) {
      const a = by.get(e.source)!;
      const b = by.get(e.target)!;
      expect([a.data.shape, b.data.shape]).toEqual(['umlActivation', 'umlActivation']);
      expect(a.position.y + a.height / 2).toBe(b.position.y + b.height / 2);
    }
  });

  it.each([...SCHEMA3_TEMPLATES].map((id) => [id]))('%s comes back from .drawio with the same shapes, texts and canvas positions', (id) => {
    const d = build(id);
    const { content } = fromDrawio(toDrawio(d, id));
    const canvas = (ns: SerializedNode[]) => ns.map((n) => [n.id, n.data.shape, n.data.label, box(n, ns)]).sort((x, y) => String(x[0]).localeCompare(String(y[0])));
    expect(canvas(content.nodes)).toEqual(canvas(d.nodes));
  });
});
