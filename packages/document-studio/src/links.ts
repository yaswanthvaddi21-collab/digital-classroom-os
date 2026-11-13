import type { Schema } from '@tiptap/pm/model';
import { documentSchema } from './schema';

/**
 * Whether Tiptap's link rules allow this address (its isAllowedUri, with the editor's configured protocols).
 * Asked through the link mark's own rendering, which blanks addresses it does not allow, so the rules are
 * exactly the ones the editor applies.
 */
export function isAllowedHref(href: string, schema: Schema = documentSchema()): boolean {
  const type = schema.marks.link;
  if (!type?.spec.toDOM || !href.trim()) return false;
  const out = type.spec.toDOM(type.create({ href }), true) as unknown;
  if (!Array.isArray(out) || typeof out[1] !== 'object' || !out[1]) return false;
  return (out[1] as Record<string, unknown>).href === href;
}

const SCHEME = /^[a-z][a-z0-9+.-]*:/i;
/** "example.com:8080/x" or "localhost:3000": a host and port, which looks like a scheme but is not one. */
const HOST_PORT = /^(localhost|[a-z0-9-]+(\.[a-z0-9-]+)+):\d{1,5}([/?#]|$)/i;
const hasScheme = (text: string) => SCHEME.test(text) && !HOST_PORT.test(text);
const EMAIL = /^[^\s@/:]+@[^\s@/:]+\.[^\s@/:]+$/;

/**
 * Turns what a user typed into a link address: "example.com" becomes "https://example.com" and
 * "name@example.com" becomes "mailto:name@example.com". Addresses with a scheme are kept as typed, and in-document
 * anchors ("#section") too. Returns an error for schemes the editor does not allow (such as javascript:).
 */
export function normalizeLinkInput(input: string, schema?: Schema): { href: string } | { error: string } {
  const text = input.trim();
  if (!text) return { error: 'Enter a link address' };
  let href = text;
  if (!hasScheme(text) && !text.startsWith('#')) {
    if (/\s/.test(text)) return { error: 'A link address cannot contain spaces' };
    href = EMAIL.test(text) ? `mailto:${text}` : `https://${text.replace(/^\/+/, '')}`;
  }
  if (!isAllowedHref(href, schema)) return { error: 'This kind of link is not allowed. Use an http, https or mailto address.' };
  return { href };
}

/**
 * The address to write into an exported file, or null when the link must be written as plain text: addresses the
 * editor does not allow (e.g. javascript: from a crafted file) and in-document anchors. Scheme-less addresses saved
 * by older versions ("example.com") get https://, which is what the user meant (they would otherwise be relative).
 */
export function exportHref(raw: unknown, schema?: Schema): string | null {
  if (typeof raw !== 'string') return null;
  const href = raw.trim();
  if (!href || href.startsWith('#')) return null;
  const candidate = hasScheme(href) ? href : EMAIL.test(href) ? `mailto:${href}` : /^[\w-]+(\.[\w-]+)+([/?#:]|$)/.test(href) || HOST_PORT.test(href) ? `https://${href}` : null;
  return candidate && isAllowedHref(candidate, schema) ? candidate : null;
}
