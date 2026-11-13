/**
 * Object URLs for diagram previews, shared by every diagram on screen (audit DS-10 / WEB-10 / TD-14).
 * - A failed or empty load is never cached: it resolves to null ("preview unavailable") and the next view retries.
 * - URLs are reference counted while shown; unused ones are kept for quick re-display, up to `capacity`, and the
 *   least recently used are revoked beyond that.
 */
export class PreviewUrlCache {
  private readonly entries = new Map<string, { url: Promise<string | null>; refs: number }>();

  constructor(
    private readonly capacity = 24,
    private readonly create: (blob: Blob) => string = (b) => URL.createObjectURL(b),
    private readonly revoke: (url: string) => void = (u) => URL.revokeObjectURL(u),
  ) {}

  /** Gets the URL for a preview and holds it until `release`. Resolves to null when the preview cannot be loaded. */
  acquire(id: string, load: (id: string) => Promise<Blob | undefined>): Promise<string | null> {
    let entry = this.entries.get(id);
    if (entry) {
      this.entries.delete(id); // re-inserted below as the most recently used
    } else {
      const created = {
        url: Promise.resolve()
          .then(() => load(id))
          .then((blob) => (blob ? this.create(blob) : null))
          .catch(() => null),
        refs: 0,
      };
      // Failures are evicted at once, so the next view tries again.
      void created.url.then((u) => {
        if (u === null && this.entries.get(id) === created) this.entries.delete(id);
      });
      entry = created;
    }
    entry.refs++;
    this.entries.set(id, entry);
    return entry.url;
  }

  /** Stops holding a preview. Unused previews beyond the capacity are revoked, oldest first. */
  release(id: string) {
    const entry = this.entries.get(id);
    if (entry) entry.refs = Math.max(0, entry.refs - 1);
    this.trim();
  }

  private trim() {
    let unused = [...this.entries].filter(([, e]) => e.refs === 0);
    while (unused.length > this.capacity) {
      const [id, entry] = unused.shift()!;
      this.entries.delete(id);
      void entry.url.then((u) => u && this.revoke(u));
      unused = unused.filter(([k]) => k !== id);
    }
  }

  /** Number of cached previews (for tests). */
  get size() {
    return this.entries.size;
  }

  has(id: string) {
    return this.entries.has(id);
  }
}
