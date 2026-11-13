/**
 * Readers for the stored attributes of inserted objects (shapes, text boxes, figures). A document may come from a
 * file or a paste, so every value is checked before it reaches markup, CSS or an export: colours must be #rrggbb
 * (or 'none'), sizes finite numbers in range, choices one of a fixed set. Anything else gives the default; the
 * stored value itself is left as it is.
 */

/** A #rrggbb colour (lower case), 'none' when allowed, or the fallback. */
export function safeColor(value: unknown, fallback: string, allowNone = true): string {
  if (typeof value !== 'string') return fallback;
  const v = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(v)) return v;
  if (/^#[0-9a-f]{3}$/.test(v)) return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  if (allowNone && v === 'none') return 'none';
  return fallback;
}

/** A finite number clamped to [min, max], or the fallback. Numeric strings (from HTML attributes) are read too. */
export function safeNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** One of `choices`, or the fallback. */
export function safeChoice<T extends string>(value: unknown, choices: readonly T[], fallback: T): T {
  return typeof value === 'string' && (choices as readonly string[]).includes(value) ? (value as T) : fallback;
}

export const ALIGNMENTS = ['left', 'center', 'right'] as const;
export type Alignment = (typeof ALIGNMENTS)[number];

/** Escapes text for XML/HTML content and attribute values. */
export const escapeXml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);

/** Dark text on light fills, white text on dark ones. */
export function textColorOn(fill: string): string {
  if (fill === 'none') return '#1a1a1f';
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(fill.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.2 ? '#ffffff' : '#1a1a1f';
}
