import { describe, expect, it, vi } from 'vitest';
import { PreviewUrlCache } from './previewCache';

const blob = () => new Blob(['png'], { type: 'image/png' });

describe('diagram preview URL cache (audit DS-10 / WEB-10)', () => {
  const make = (capacity = 2) => {
    let n = 0;
    const revoke = vi.fn();
    const cache = new PreviewUrlCache(capacity, () => `blob:${++n}`, revoke);
    return { cache, revoke };
  };

  it('shares one URL per preview', async () => {
    const { cache } = make();
    const load = vi.fn(async () => blob());
    const [a, b] = await Promise.all([cache.acquire('p1', load), cache.acquire('p1', load)]);
    expect(a).toBe('blob:1');
    expect(b).toBe('blob:1');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('never caches a failure: it shows "unavailable" and the next view tries again', async () => {
    const { cache } = make();
    const load = vi.fn().mockRejectedValueOnce(new Error('quota')).mockResolvedValueOnce(undefined).mockResolvedValueOnce(blob());
    expect(await cache.acquire('p1', load)).toBeNull();
    await Promise.resolve();
    expect(cache.has('p1')).toBe(false);
    expect(await cache.acquire('p1', load)).toBeNull();
    await Promise.resolve();
    expect(await cache.acquire('p1', load)).toBe('blob:1');
    expect(load).toHaveBeenCalledTimes(3);
  });

  it('keeps previews in use, and revokes the least recently used unused ones beyond capacity', async () => {
    const { cache, revoke } = make(1);
    const load = async () => blob();
    await cache.acquire('a', load); // blob:1, in use
    await cache.acquire('b', load); // blob:2
    await cache.acquire('c', load); // blob:3
    cache.release('b');
    expect(revoke).not.toHaveBeenCalled(); // one unused fits
    cache.release('c');
    await Promise.resolve();
    await Promise.resolve();
    expect(revoke).toHaveBeenCalledWith('blob:2');
    expect(cache.has('a')).toBe(true);
    expect(cache.has('c')).toBe(true);
    // Re-showing a kept preview reuses it.
    expect(await cache.acquire('c', load)).toBe('blob:3');
  });
});
