/**
 * Helpers for attachment references and for keeping large inline images out of version history.
 *
 * A version record may have large data URLs moved into the attachments store. In its content each one is then the
 * text `dcos-blob:<attachmentId>`, and the id is listed in the version's `blobRefs`. The attachment holds the exact
 * text of the data URL (UTF-8), so putting it back gives the original string byte for byte.
 */

/** Text that stands in a compacted version for a data URL stored as an attachment. */
export const BLOB_PREFIX = 'dcos-blob:';
/** Inline data URLs longer than this (in characters) are moved out of new version records. */
export const INLINE_BLOB_MIN_LENGTH = 16 * 1024;
/** Media type of an attachment that holds the text of a data URL taken out of a version. */
export const DATA_URL_MIME = 'text/x-dcos-data-url';

const isPlainObject = (v: unknown): v is Record<string, unknown> => Object.prototype.toString.call(v) === '[object Object]';

/**
 * Calls `fn` for every string anywhere inside `value`: string values, object keys, and the contents of arrays,
 * Maps and Sets. Iterative, so deeply nested content cannot overflow the stack; shared or circular parts are
 * visited once.
 */
export function forEachString(value: unknown, fn: (s: string) => void): void {
  const seen = new Set<object>();
  const stack: unknown[] = [value];
  while (stack.length) {
    const v = stack.pop();
    if (typeof v === 'string') {
      fn(v);
      continue;
    }
    if (!v || typeof v !== 'object' || seen.has(v)) continue;
    seen.add(v);
    if (Array.isArray(v)) stack.push(...v);
    else if (v instanceof Map) for (const [k, x] of v) stack.push(k, x);
    else if (v instanceof Set) stack.push(...v);
    else if (isPlainObject(v)) {
      for (const [k, x] of Object.entries(v)) {
        fn(k);
        stack.push(x);
      }
    }
  }
}

/**
 * Adds every attachment id `value` may refer to: each string as it is (a string equal to an attachment id refers
 * to it) and, for `dcos-blob:<id>`, the id after the prefix.
 */
export function collectReferences(value: unknown, into: Set<string>): void {
  forEachString(value, (s) => {
    into.add(s);
    if (s.startsWith(BLOB_PREFIX)) into.add(s.slice(BLOB_PREFIX.length));
  });
}

/** References held outside the database. Text that is itself JSON (a whole saved draft) is searched as well. */
export function collectExtraReferences(values: Iterable<string> | undefined, into: Set<string>): void {
  if (!values) return;
  for (const s of values) {
    if (typeof s !== 'string') continue;
    collectReferences(s, into);
    const t = s.trimStart();
    if (t.startsWith('{') || t.startsWith('[')) {
      try {
        collectReferences(JSON.parse(s), into);
      } catch {
        // Not JSON: the text itself was added above.
      }
    }
  }
}

/** Distinct inline data URLs in `value` that are large enough to move out of a version. */
export function findLargeDataUrls(value: unknown): string[] {
  const found = new Set<string>();
  forEachString(value, (s) => {
    if (s.length > INLINE_BLOB_MIN_LENGTH && s.startsWith('data:')) found.add(s);
  });
  return [...found];
}

/** True when some string in `value` already starts with the blob prefix (such content is never compacted). */
export function containsBlobText(value: unknown): boolean {
  let hit = false;
  forEachString(value, (s) => {
    if (s.startsWith(BLOB_PREFIX)) hit = true;
  });
  return hit;
}

/**
 * Copy of `value` with every string value passed through `fn`. Arrays and plain objects are rebuilt with their keys
 * in the same order; anything else (numbers, dates, binary data) is kept as it is.
 */
export function mapStrings(value: unknown, fn: (s: string) => string): unknown {
  const copies = new Map<object, unknown>();
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return fn(v);
    if (!v || typeof v !== 'object') return v;
    if (copies.has(v)) return copies.get(v);
    if (Array.isArray(v)) {
      const out: unknown[] = [];
      copies.set(v, out);
      for (const x of v) out.push(walk(x));
      return out;
    }
    if (isPlainObject(v)) {
      const out: Record<string, unknown> = {};
      copies.set(v, out);
      for (const [k, x] of Object.entries(v)) out[k] = walk(x);
      return out;
    }
    return v;
  };
  return walk(value);
}

/** The exact text of a data URL as bytes, or null when UTF-8 could not give the same text back. */
export function encodeDataUrl(url: string): ArrayBuffer | null {
  const bytes = new TextEncoder().encode(url);
  if (decodeDataUrl(bytes) !== url) return null;
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export function decodeDataUrl(data: ArrayBuffer | Uint8Array): string {
  return new TextDecoder('utf-8', { ignoreBOM: true }).decode(data);
}

/** The attachment ids a version lists as moved out of its content (ignores anything malformed in the record). */
export function blobRefsOf(v: { blobRefs?: unknown }): string[] {
  return Array.isArray(v.blobRefs) ? v.blobRefs.filter((x): x is string => typeof x === 'string') : [];
}

/**
 * Puts the original data URLs back into compacted content. Only the text `dcos-blob:<id>` for an id in `ids` is
 * replaced; anything else, including such text for other ids, stays as it is. Ids `lookup` cannot resolve are left
 * as their reference text and listed in `missing`.
 */
export function rehydrate(content: unknown, ids: Iterable<string>, lookup: (id: string) => string | undefined): { content: unknown; missing: string[] } {
  const wanted = new Set(ids);
  const missing = new Set<string>();
  if (!wanted.size) return { content, missing: [] };
  const out = mapStrings(content, (s) => {
    if (!s.startsWith(BLOB_PREFIX)) return s;
    const id = s.slice(BLOB_PREFIX.length);
    if (!wanted.has(id)) return s;
    const url = lookup(id);
    if (url === undefined) {
      missing.add(id);
      return s;
    }
    return url;
  });
  return { content: out, missing: [...missing] };
}
