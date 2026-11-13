// @vitest-environment jsdom
/** The storage adapter is created through a factory that a native shell can replace before the app loads (TD-5). */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StorageHooks } from './platform';

beforeEach(() => {
  vi.resetModules();
});

describe('storage factory', () => {
  it('defaults to the IndexedDB adapter on the web, with the recovery actions', async () => {
    const { IndexedDbAdapter } = await import('@dcos/local-storage');
    const { storage, upgradeRecovery } = await import('./storage');
    expect(storage).toBeInstanceOf(IndexedDbAdapter);
    expect(upgradeRecovery).toBe(storage);
  });

  it('uses a factory set before the app loads, handing it the app hooks', async () => {
    const { IndexedDbAdapter } = await import('@dcos/local-storage');
    const platform = await import('./platform');
    const custom = new IndexedDbAdapter('platform-test-db');
    const factory = vi.fn((_hooks: StorageHooks) => custom);
    platform.setStorageFactory(factory);
    const { storage } = await import('./storage');
    expect(storage).toBe(custom);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(factory).toHaveBeenCalledWith({ onVersionChange: expect.any(Function), onBlocked: expect.any(Function), extraReferences: expect.any(Function) });
    // Emergency drafts are handed to the adapter as outside references.
    localStorage.setItem('dcos-emergency-draft:document:x', '{"baseVersion":1,"content":"att-1"}');
    expect([...factory.mock.calls[0]![0].extraReferences!()]).toEqual(['{"baseVersion":1,"content":"att-1"}']);
    localStorage.clear();
    // Replacing it once the adapter exists would leave two adapters on the same data.
    expect(() => platform.setStorageFactory(factory)).toThrow(/before the app loads/);
    await custom.close();
  });

  it('a non-IndexedDB adapter works without the IndexedDB recovery actions', async () => {
    const { IndexedDbAdapter } = await import('@dcos/local-storage');
    const platform = await import('./platform');
    const inner = new IndexedDbAdapter('platform-test-db-2');
    // A stand-in for a native adapter: same interface, different class.
    const native = new Proxy(inner, { getPrototypeOf: () => Object.prototype });
    platform.setStorageFactory(() => native);
    const { storage, upgradeRecovery } = await import('./storage');
    expect(storage).toBe(native);
    expect(upgradeRecovery).toBeNull();
    await inner.close();
  });
});
