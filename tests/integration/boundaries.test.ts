/**
 * Package boundaries (audit ARCH-1): feature packages depend only on the design system, never on storage or the
 * app, so each module can be reused by the desktop and Android shells and swapped independently.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..');
const ALLOWED: Record<string, string[]> = {
  ui: [],
  'local-storage': [],
  'document-studio': ['@dcos/ui'],
  'diagram-studio': ['@dcos/ui'],
  // Phase 7 (ADR 0014): like the other studios, only the design system; storage and diagrams come through hosts.
  'presentation-studio': ['@dcos/ui'],
};

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f) ? [p] : [];
  });
}

describe('package boundaries', () => {
  it('checks every package that has source code (a new package cannot go unchecked)', () => {
    const packages = readdirSync(join(ROOT, 'packages')).filter((p) => statSync(join(ROOT, 'packages', p)).isDirectory() && existsSync(join(ROOT, 'packages', p, 'src')));
    expect(packages.sort()).toEqual(Object.keys(ALLOWED).sort());
  });

  for (const [pkg, allowed] of Object.entries(ALLOWED)) {
    it(`${pkg} imports only ${allowed.join(', ') || 'no other @dcos package'}`, () => {
      const offenders: string[] = [];
      for (const file of files(join(ROOT, 'packages', pkg, 'src'))) {
        for (const m of readFileSync(file, 'utf8').matchAll(/from '(@dcos\/[a-z-]+)/g)) {
          if (!allowed.includes(m[1])) offenders.push(`${relative(ROOT, file)} → ${m[1]}`);
        }
      }
      expect(offenders).toEqual([]);
    });
  }

  it('uses no paid Tiptap Pro packages', () => {
    expect(readFileSync(join(ROOT, 'package-lock.json'), 'utf8')).not.toContain('@tiptap-pro/');
  });
});
