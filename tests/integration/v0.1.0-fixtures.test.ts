/**
 * Frozen-contract tests: data written by v0.1.0 must keep loading, unchanged, in every later build.
 * Fixtures were generated at tag v0.1.0-baseline (see tests/fixtures/v0.1.0/README.md). Never regenerate them.
 */
import 'fake-indexeddb/auto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { IndexedDbAdapter, type BackupFile, type WorkspaceItem } from '@dcos/local-storage';
import { deserializeDiagram, serializeDiagram, type DiagramContent } from '@dcos/diagram-studio';

const DIR = join(__dirname, '..', 'fixtures', 'v0.1.0');
const load = <T>(rel: string): T => JSON.parse(readFileSync(join(DIR, rel), 'utf8'));
const backup = load<BackupFile>('backup-v1.json');
const diagramFiles = readdirSync(join(DIR, 'diagrams'));

describe('v0.1.0 backup', () => {
  it('imports into an empty device with every id, field and version intact', async () => {
    const store = new IndexedDbAdapter('fixture-import');
    const report = await store.importBackup(structuredClone(backup));
    expect(report).toMatchObject({ added: backup.items.length, skipped: 0, copied: 0, versionsAdded: backup.versions.length });
    for (const item of backup.items) {
      const stored = await store.get(item.kind, item.id);
      expect(stored, item.title).toEqual(item);
    }
    for (const item of backup.items) {
      const versions = await store.listVersions(item.kind, item.id);
      const expected = backup.versions.filter((v) => v.itemId === item.id).map((v) => v.id).sort();
      expect(versions.map((v) => v.id).sort()).toEqual(expected);
    }
    const live = [...(await store.list('document')), ...(await store.list('diagram'))];
    const trashed = [...(await store.list('document', { trashed: true })), ...(await store.list('diagram', { trashed: true }))];
    expect(live.length + trashed.length).toBe(backup.items.length);
    expect(trashed.map((t) => t.id)).toEqual(backup.items.filter((i) => i.deletedAt).map((i) => i.id));
    await store.close();
  });

  it('covers every version reason, a trashed item and a favourite', () => {
    expect(new Set(backup.versions.map((v) => v.reason))).toEqual(new Set(['create', 'manual', 'auto', 'restore']));
    expect(backup.items.some((i) => i.deletedAt)).toBe(true);
    expect(backup.items.some((i) => i.favorite)).toBe(true);
  });
});

describe('v0.1.0 diagrams', () => {
  it.each(diagramFiles)('%s round-trips through deserialize/serialize with every node, edge and setting intact', (file) => {
    const item = load<WorkspaceItem<DiagramContent>>(`diagrams/${file}`);
    const state = deserializeDiagram(item.content);
    const again = serializeDiagram(state.nodes, state.edges, state.viewport, state.settings);
    // Only the schema number moves forward (written once the user edits); the data itself is unchanged.
    expect(item.content.schemaVersion).toBe(1);
    expect(JSON.stringify({ ...again, schemaVersion: 1 })).toBe(JSON.stringify(item.content));
  });
});
