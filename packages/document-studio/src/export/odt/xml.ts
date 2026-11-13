/** XML helpers for the OpenDocument writer. */

/** Characters XML 1.0 does not allow (control characters, unpaired surrogates, U+FFFE/U+FFFF). */
const INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/** Escapes text for an XML attribute or element, dropping characters XML cannot hold. */
export function esc(value: unknown): string {
  return String(value ?? '')
    .replace(INVALID_XML, '')
    .replace(/[&<>"]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;'));
}

/** ` name="value"` for each defined value, in order (undefined, null and false are left out). */
export function attrs(values: Record<string, string | number | null | undefined | false>): string {
  let out = '';
  for (const [k, v] of Object.entries(values)) if (v !== undefined && v !== null && v !== false) out += ` ${k}="${esc(v)}"`;
  return out;
}

/** An element: `<name attrs/>` or `<name attrs>children</name>`. */
export function el(name: string, values: Record<string, string | number | null | undefined | false> = {}, children = ''): string {
  return children ? `<${name}${attrs(values)}>${children}</${name}>` : `<${name}${attrs(values)}/>`;
}

/**
 * Text as OpenDocument paragraph content. ODF collapses runs of white space and ignores it at the start of a
 * paragraph, so repeated spaces become text:s, tabs text:tab and line breaks text:line-break, keeping the text exact.
 * `state.atStart` is true at the start of a paragraph (and after a line break); it is updated.
 */
export function odfText(text: string, state: { atStart: boolean }): string {
  let out = '';
  let i = 0;
  const clean = text.replace(INVALID_XML, '');
  while (i < clean.length) {
    const c = clean[i];
    if (c === ' ') {
      let n = 1;
      while (clean[i + n] === ' ') n++;
      // The first space of a run is kept as text unless it starts the line; the rest are counted.
      const literal = state.atStart ? 0 : 1;
      if (literal) out += ' ';
      const counted = n - literal;
      if (counted > 0) out += counted === 1 ? '<text:s/>' : `<text:s text:c="${counted}"/>`;
      i += n;
      state.atStart = false;
      continue;
    }
    if (c === '\t') out += '<text:tab/>';
    else if (c === '\n') {
      out += '<text:line-break/>';
      state.atStart = true;
      i++;
      continue;
    } else if (c === '\r') {
      i++;
      continue;
    } else out += esc(c);
    state.atStart = false;
    i++;
  }
  return out;
}

/** Millimetres as an ODF length in centimetres. */
export const cm = (mm: number) => `${round(mm / 10, 4)}cm`;
/** CSS pixels (96 per inch) as an ODF length in centimetres. */
export const pxToCm = (px: number) => `${round((px * 2.54) / 96, 4)}cm`;

export function round(n: number, digits: number) {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

export const NS = {
  office: 'urn:oasis:names:tc:opendocument:xmlns:office:1.0',
  style: 'urn:oasis:names:tc:opendocument:xmlns:style:1.0',
  text: 'urn:oasis:names:tc:opendocument:xmlns:text:1.0',
  table: 'urn:oasis:names:tc:opendocument:xmlns:table:1.0',
  draw: 'urn:oasis:names:tc:opendocument:xmlns:drawing:1.0',
  fo: 'urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0',
  xlink: 'http://www.w3.org/1999/xlink',
  dc: 'http://purl.org/dc/elements/1.1/',
  meta: 'urn:oasis:names:tc:opendocument:xmlns:meta:1.0',
  number: 'urn:oasis:names:tc:opendocument:xmlns:datastyle:1.0',
  svg: 'urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0',
  manifest: 'urn:oasis:names:tc:opendocument:xmlns:manifest:1.0',
} as const;

/** xmlns declarations for the given prefixes. */
export const xmlns = (...prefixes: Array<keyof typeof NS>) => prefixes.map((p) => ` xmlns:${p}="${NS[p]}"`).join('');
