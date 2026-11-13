import type { JSONContent } from '@tiptap/core';
import { ShadingType } from 'docx';
import { NOTES } from '../report';
import { wordHighlight } from './colors';
import type { Ctx, MarkHandler, RunStyle } from './context';
import { toHalfPoints, toHex } from './units';

/** How each mark becomes Word run formatting. Marks without a handler are written as plain text. */
export const MARK_HANDLERS: Record<string, MarkHandler> = {
  bold: (s) => {
    s.bold = true;
  },
  italic: (s) => {
    s.italics = true;
  },
  underline: (s) => {
    s.underline = {};
  },
  strike: (s) => {
    s.strike = true;
  },
  code: (s) => {
    s.font = 'Courier New';
  },
  subscript: (s) => {
    s.subScript = true;
  },
  superscript: (s) => {
    s.superScript = true;
  },
  // A real Word highlight (w:highlight), so Word's highlighter tools see it. Word has 16 highlight colours: others
  // use the nearest one, and the export says so.
  highlight: (s, a, ctx) => {
    const hex = toHex(a.color);
    if (!hex) {
      s.highlight = 'yellow';
      return;
    }
    const { name, exact } = wordHighlight(hex);
    s.highlight = name;
    if (!exact) ctx.report.once(`highlight:${hex}`, NOTES.highlightColour);
  },
  textStyle: (s, a) => {
    const color = toHex(a.color);
    if (color) s.color = color;
    const size = toHalfPoints(a.fontSize);
    if (size) s.size = size;
    if (typeof a.fontFamily === 'string' && a.fontFamily) s.font = a.fontFamily.split(',')[0].replace(/['"]/g, '').trim();
    const bg = toHex(a.backgroundColor);
    if (bg) s.shading = { type: ShadingType.CLEAR, fill: bg, color: 'auto' };
  },
  // @phase4:docx-marks — register new marks here (one entry per mark type).
};

export function runStyle(marks: JSONContent['marks'] = [], ctx: Ctx): RunStyle {
  const s: RunStyle = {};
  for (const mark of marks) MARK_HANDLERS[mark.type]?.(s, mark.attrs ?? {}, ctx);
  return s;
}
