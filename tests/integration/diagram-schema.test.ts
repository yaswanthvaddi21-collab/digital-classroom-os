/**
 * Saved diagrams keep their schema (Phase 5, ADR 0012): every v0.1.0 diagram and every diagram the Phase 4 build
 * could write is saved as schema 2 by this build, so v0.2 builds before Phase 5 can still edit it.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MAX_CONTENT_SCHEMA, MAX_CONTENT_SCHEMA_BY_KIND, type BackupFile, type WorkspaceItem } from '@dcos/local-storage';
import { DIAGRAM_SCHEMA, deserializeDiagram, schema3Reason, serializeDiagram, type DiagramContent } from '@dcos/diagram-studio';
import { DOCUMENT_SCHEMA } from '@dcos/document-studio';
import { PRESENTATION_SCHEMA } from '@dcos/presentation-studio';

const DIR = join(__dirname, '..', 'fixtures', 'v0.1.0');
const load = <T>(rel: string): T => JSON.parse(readFileSync(join(DIR, rel), 'utf8'));
const save = (content: unknown) => {
  const s = deserializeDiagram(content);
  return serializeDiagram(s.nodes, s.edges, s.viewport, s.settings, s.layers);
};

describe('v0.1.0 diagrams', () => {
  const files = readdirSync(join(DIR, 'diagrams'));
  it.each(files)('%s is saved as schema 2 with its data unchanged', (file) => {
    const item = load<WorkspaceItem<DiagramContent>>(`diagrams/${file}`);
    const again = save(item.content);
    expect(schema3Reason(again)).toBeNull();
    expect(again.schemaVersion).toBe(2);
    expect({ ...again, schemaVersion: 1 }).toEqual(item.content);
  });

  it('every diagram in the v0.1.0 backup, and each of its versions, is schema 2 when saved', () => {
    const backup = load<BackupFile>('backup-v1.json');
    const contents = [...backup.items.filter((i) => i.kind === 'diagram').map((i) => i.content), ...backup.versions.filter((v) => backup.items.find((i) => i.id === v.itemId)?.kind === 'diagram').map((v) => v.content)];
    expect(contents.length).toBeGreaterThan(0);
    for (const c of contents) expect(save(c).schemaVersion).toBe(2);
  });
});

describe('diagrams the Phase 4 build wrote', () => {
  it('a diagrams.net import with the default size copied into its data (a Phase 4 importer quirk) stays schema 2', () => {
    const stored = {
      schemaVersion: 2,
      nodes: [{ id: 'a', position: { x: 0, y: 0 }, width: 120, height: 60, data: { shape: 'rectangle', fill: '#fff', stroke: '#000', strokeWidth: 1, textColor: '#000', fontSize: 12, dashed: false, bold: false, label: 'A', width: 160, height: 70 } }],
      edges: [],
      viewport: null,
      settings: { snapToGrid: true, showGrid: true, autoLayout: 'none' },
    };
    const again = save(stored);
    expect(again.schemaVersion).toBe(2);
    expect(again.nodes[0].data).toEqual(stored.nodes[0].data);
  });

  it('UML, ER and every connector end of schema 2, with zIndex and a viewport, stays schema 2', () => {
    const stored: DiagramContent = {
      schemaVersion: 2,
      nodes: [
        { id: 'c', position: { x: 0, y: 0 }, width: 200, height: 130, zIndex: 3, data: { shape: 'umlClass', fill: '#fff', stroke: '#000', strokeWidth: 2, textColor: '#000', fontSize: 13, dashed: true, bold: true, label: 'A\n--\nb' } },
        { id: 'e', position: { x: 400, y: 0 }, width: 190, height: 120, data: { shape: 'erEntity', fill: '#fff', stroke: '#000', strokeWidth: 2, textColor: '#000', fontSize: 13, dashed: false, bold: false, label: 'T\nPK id' } },
      ],
      edges: (['none', 'arrow', 'open-arrow', 'triangle', 'diamond', 'diamond-filled', 'circle', 'crow-many', 'crow-one', 'crow-zero-many', 'crow-zero-one'] as const).map((m, i) => ({
        id: `e${i}`,
        source: 'c',
        target: 'e',
        sourceHandle: (['t', 'r', 'b', 'l'] as const)[i % 4],
        targetHandle: i % 2 ? null : 'l',
        type: (['smoothstep', 'step', 'straight', 'default'] as const)[i % 4],
        label: `m${i}`,
        data: { color: '#000', width: 1.5, dashed: i % 2 === 0, arrow: (['end', 'both', 'none'] as const)[i % 3], startMarker: m, endMarker: m },
      })),
      viewport: { x: 10, y: 20, zoom: 0.8 },
      settings: { snapToGrid: false, showGrid: false, autoLayout: 'LR', connector: 'step' },
    };
    const again = save(stored);
    expect(schema3Reason(again)).toBeNull();
    expect(again).toEqual(stored);
  });
});

describe('backups accept what this build writes', () => {
  it('the backup limits match the newest document, diagram and presentation schemas', () => {
    expect(MAX_CONTENT_SCHEMA_BY_KIND).toEqual({ document: DOCUMENT_SCHEMA, diagram: DIAGRAM_SCHEMA, presentation: PRESENTATION_SCHEMA });
    expect(MAX_CONTENT_SCHEMA).toBe(Math.max(DOCUMENT_SCHEMA, DIAGRAM_SCHEMA, PRESENTATION_SCHEMA));
  });
});
