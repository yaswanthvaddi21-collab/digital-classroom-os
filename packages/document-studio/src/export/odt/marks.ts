import type { JSONContent } from '@tiptap/core';
import { toHalfPoints, toHex } from '../docx/units';
import type { OdfProps, OdtCtx, OdtMarkHandler } from './context';

const both = (props: OdfProps, name: 'font-weight' | 'font-style', value: string) => {
  // Western, Asian and complex scripts: set all three, as word processors do.
  props[`fo:${name}`] = value;
  props[`style:${name}-asian`] = value;
  props[`style:${name}-complex`] = value;
};

/**
 * How each mark becomes ODF text properties. Marks without a handler are written as plain text and reported.
 * `code` and `link` are written as elements (a "Source Text" span and text:a), not as properties: see inlines.ts.
 */
export const ODT_MARK_HANDLERS: Record<string, OdtMarkHandler> = {
  bold: (p) => both(p, 'font-weight', 'bold'),
  italic: (p) => both(p, 'font-style', 'italic'),
  underline: (p) => {
    p['style:text-underline-style'] = 'solid';
    p['style:text-underline-width'] = 'auto';
    p['style:text-underline-color'] = 'font-color';
  },
  strike: (p) => {
    p['style:text-line-through-style'] = 'solid';
  },
  subscript: (p) => {
    p['style:text-position'] = 'sub 58%';
  },
  superscript: (p) => {
    p['style:text-position'] = 'super 58%';
  },
  highlight: (p, a) => {
    p['fo:background-color'] = `#${(toHex(a.color) ?? 'FFFF00').toLowerCase()}`;
  },
  textStyle: (p, a) => {
    const color = toHex(a.color);
    if (color) p['fo:color'] = `#${color.toLowerCase()}`;
    const size = toHalfPoints(a.fontSize);
    if (size) {
      const pt = `${size / 2}pt`;
      p['fo:font-size'] = pt;
      p['style:font-size-asian'] = pt;
      p['style:font-size-complex'] = pt;
    }
    if (typeof a.fontFamily === 'string' && a.fontFamily.trim()) {
      const family = a.fontFamily.split(',')[0].replace(/['"]/g, '').trim();
      if (family) p['fo:font-family'] = family;
    }
    const bg = toHex(a.backgroundColor);
    if (bg) p['fo:background-color'] = `#${bg.toLowerCase()}`;
    // lineHeight is a paragraph property in ODF: see paragraph.ts.
  },
  // Written as elements, so nothing to add here (listed so they are not reported as unsupported).
  code: () => undefined,
  link: () => undefined,
  // Register new marks here (one entry per mark type); Round 3 wires in the marks other features add.
};

export function textProps(marks: JSONContent['marks'] = [], ctx: OdtCtx, base: OdfProps = {}): OdfProps {
  const props: OdfProps = { ...base };
  for (const mark of marks) ODT_MARK_HANDLERS[mark.type]?.(props, mark.attrs ?? {}, ctx);
  return props;
}
