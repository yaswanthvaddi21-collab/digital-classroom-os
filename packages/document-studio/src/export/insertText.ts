/** Plain-text forms of G-INSERT content: equations keep their LaTeX, shapes and captions get a line of their own. */
import type { JSONContent } from '@tiptap/core';
import { imageCaption } from '../extensions/figureImage';
import { shapeLabel } from '../extensions/shapeModel';
import type { TextHandler } from './text';

const latexOf = (n: JSONContent) => String(n.attrs?.latex ?? '').trim();

/** Inline equation: its LaTeX between single dollars, as typed in LaTeX documents. */
export const inlineMathText = (n: JSONContent) => (latexOf(n) ? `$${latexOf(n)}$` : '');

/** Display equation: its LaTeX between double dollars, on a line of its own. */
export const blockMathText: TextHandler = (n, indent, t) => {
  if (latexOf(n)) t.push(`${indent}$$${latexOf(n)}$$`, '');
};

export const shapeText: TextHandler = (n, indent, t) => t.push(`${indent}[Shape: ${shapeLabel(n.attrs)}]`, '');

/** A text box's content, as ordinary blocks at its place in the text. */
export const textBoxText: TextHandler = (n, indent, t) => t.walk(n.content, indent);

/** The caption line under a picture's marker (none without a caption). */
export const captionLines = (n: JSONContent, indent: string) => (imageCaption(n.attrs) ? [`${indent}${imageCaption(n.attrs)}`] : []);
