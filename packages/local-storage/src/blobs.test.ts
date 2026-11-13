import { describe, expect, it } from 'vitest';
import {
  BLOB_PREFIX,
  collectExtraReferences,
  collectReferences,
  containsBlobText,
  encodeDataUrl,
  decodeDataUrl,
  findLargeDataUrls,
  forEachString,
  mapStrings,
  rehydrate,
} from './blobs';

describe('reference helpers', () => {
  it('finds every string: values, keys, nested arrays, Maps and Sets; shared and circular parts once', () => {
    const shared = { s: 'shared' };
    const loop: Record<string, unknown> = { name: 'loop' };
    loop.self = loop;
    const seen: string[] = [];
    forEachString({ a: ['x', { b: 'y' }], [`key-id`]: 1, m: new Map([['mk', 'mv']]), set: new Set(['sv']), shared, again: shared, loop, n: 2, nil: null }, (s) => seen.push(s));
    expect(seen.sort()).toEqual(['a', 'again', 'b', 'key-id', 'loop', 'loop', 'm', 'mk', 'mv', 'n', 'name', 'nil', 's', 'self', 'set', 'shared', 'shared', 'sv', 'x', 'y'].sort());
  });

  it('a string equal to an id, or dcos-blob:<id>, refers to that id', () => {
    const refs = new Set<string>();
    collectReferences({ previewId: 'att-1', src: `${BLOB_PREFIX}att-2` }, refs);
    expect(refs.has('att-1')).toBe(true);
    expect(refs.has('att-2')).toBe(true);
    expect(refs.has('att-3')).toBe(false);
  });

  it('outside references are read as text and, when they are JSON, as their values too', () => {
    const refs = new Set<string>();
    collectExtraReferences(['plain-id', JSON.stringify({ content: { previewId: 'in-json' } }), '{not json', 42 as never], refs);
    expect(refs.has('plain-id')).toBe(true);
    expect(refs.has('in-json')).toBe(true);
    expect(refs.has('{not json')).toBe(true);
    collectExtraReferences(undefined, refs);
  });

  it('handles deeply nested content without overflowing the stack', () => {
    let deep: unknown = 'bottom';
    for (let i = 0; i < 100_000; i++) deep = [deep];
    const refs = new Set<string>();
    collectReferences(deep, refs);
    expect(refs.has('bottom')).toBe(true);
  });
});

describe('compaction helpers', () => {
  it('finds only data URLs longer than 16 KB, once each', () => {
    const big = `data:a,${'x'.repeat(16 * 1024)}`;
    const exact = `data:a,${'x'.repeat(16 * 1024 - 7)}`;
    expect(exact.length).toBe(16 * 1024);
    expect(findLargeDataUrls({ a: big, b: [big], c: exact, d: `http://${'x'.repeat(20_000)}` })).toEqual([big]);
  });

  it('mapStrings rebuilds arrays and plain objects in key order and keeps other values as they are', () => {
    const date = new Date(0);
    const bytes = new Uint8Array([1]);
    const input = { z: 'a', a: ['a', 1, null, true], d: date, b: bytes, u: undefined };
    const out = mapStrings(input, (s) => s.toUpperCase()) as typeof input;
    expect(Object.keys(out)).toEqual(['z', 'a', 'd', 'b', 'u']);
    expect(out).toEqual({ z: 'A', a: ['A', 1, null, true], d: date, b: bytes, u: undefined });
    expect(out.d).toBe(date);
    expect(input.z).toBe('a'); // the input is not changed
  });

  it('rehydrate replaces only reference text for listed ids, and reports the ones it cannot find', () => {
    const content = { a: `${BLOB_PREFIX}one`, b: `${BLOB_PREFIX}two`, c: `${BLOB_PREFIX}other`, d: `see ${BLOB_PREFIX}one` };
    const r = rehydrate(content, ['one', 'two'], (id) => (id === 'one' ? 'data:1' : undefined));
    expect(r.content).toEqual({ a: 'data:1', b: `${BLOB_PREFIX}two`, c: `${BLOB_PREFIX}other`, d: `see ${BLOB_PREFIX}one` });
    expect(r.missing).toEqual(['two']);
    expect(rehydrate(content, [], () => 'x').content).toBe(content);
  });

  it('encodes a data URL as its exact text, and refuses one UTF-8 cannot carry exactly', () => {
    const url = 'data:text/plain;charset=utf-8,héllo \u{1F600}';
    expect(decodeDataUrl(encodeDataUrl(url)!)).toBe(url);
    expect(encodeDataUrl('data:text/plain,\uD800')).toBeNull();
    expect(decodeDataUrl(encodeDataUrl('﻿data:x')!)).toBe('﻿data:x'); // a leading BOM is kept
  });

  it('containsBlobText spots reference-like text anywhere', () => {
    expect(containsBlobText({ a: [{ b: `${BLOB_PREFIX}x` }] })).toBe(true);
    expect(containsBlobText({ a: 'dcos-blo' })).toBe(false);
  });
});
