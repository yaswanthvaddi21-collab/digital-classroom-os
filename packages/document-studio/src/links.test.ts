import { describe, expect, it } from 'vitest';
import { exportHref, isAllowedHref, normalizeLinkInput } from './links';

describe('links (audit DS-7)', () => {
  it('uses the editor link rules (Tiptap isAllowedUri)', () => {
    expect(isAllowedHref('https://example.com')).toBe(true);
    expect(isAllowedHref('mailto:a@b.co')).toBe(true);
    expect(isAllowedHref('javascript:alert(1)')).toBe(false);
    expect(isAllowedHref(' javascript:alert(1)')).toBe(false);
    expect(isAllowedHref('vbscript:x')).toBe(false);
    expect(isAllowedHref('')).toBe(false);
  });

  it('gives addresses typed without a scheme https:// (or mailto: for an e-mail address)', () => {
    expect(normalizeLinkInput('example.com')).toEqual({ href: 'https://example.com' });
    expect(normalizeLinkInput('  www.example.com/a?b=1  ')).toEqual({ href: 'https://www.example.com/a?b=1' });
    expect(normalizeLinkInput('//cdn.example.com/x')).toEqual({ href: 'https://cdn.example.com/x' });
    expect(normalizeLinkInput('student@college.edu')).toEqual({ href: 'mailto:student@college.edu' });
    expect(normalizeLinkInput('http://example.com')).toEqual({ href: 'http://example.com' });
    expect(normalizeLinkInput('#results')).toEqual({ href: '#results' });
  });

  it('reads a host with a port as an address, not as a scheme', () => {
    expect(normalizeLinkInput('example.com:8080')).toEqual({ href: 'https://example.com:8080' });
    expect(normalizeLinkInput('localhost:3000/x')).toEqual({ href: 'https://localhost:3000/x' });
    expect(normalizeLinkInput('www.example.org:443/a?b')).toEqual({ href: 'https://www.example.org:443/a?b' });
    expect(normalizeLinkInput('mailto:a@b.co')).toEqual({ href: 'mailto:a@b.co' });
    expect(normalizeLinkInput('javascript:1')).toHaveProperty('error');
    expect(exportHref('example.com:8080/x')).toBe('https://example.com:8080/x');
    expect(exportHref('localhost:3000')).toBe('https://localhost:3000');
  });

  it('refuses addresses the editor does not allow, and nonsense', () => {
    expect(normalizeLinkInput('javascript:alert(1)')).toHaveProperty('error');
    expect(normalizeLinkInput('two words')).toHaveProperty('error');
    expect(normalizeLinkInput('   ')).toHaveProperty('error');
  });

  it('exports only allowed addresses; old scheme-less ones get https://', () => {
    expect(exportHref('https://example.com')).toBe('https://example.com');
    expect(exportHref('example.com/x')).toBe('https://example.com/x');
    expect(exportHref('a@b.co')).toBe('mailto:a@b.co');
    expect(exportHref('javascript:alert(1)')).toBeNull();
    expect(exportHref('#anchor')).toBeNull();
    expect(exportHref('notes')).toBeNull();
    expect(exportHref(42)).toBeNull();
  });
});
