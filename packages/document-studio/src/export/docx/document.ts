import type { IPropertiesOptions } from 'docx';
import { commentsContributor, languageContributor } from '../../review/docx';
import type { Ctx } from './context';
import { namedStylesContributor } from './format'; // G-FORMAT
import { layoutContributor } from './sections'; // G-LAYOUT

/** Mutable form of the Document options, so contributors can fill in their part. */
export type DocumentOptions = { -readonly [K in keyof IPropertiesOptions]: IPropertiesOptions[K] };

/**
 * Document-level contributions (styles, comments, numbering, sections, settings), applied in order after the body
 * has been converted, so they can use what the body conversion collected in `ctx`.
 */
export type DocumentContributor = (options: DocumentOptions, ctx: Ctx) => void;

export const DOCUMENT_CONTRIBUTORS: DocumentContributor[] = [
  // G-REVIEW: Word comments (with replies and resolved state) and the document language (w:lang).
  commentsContributor,
  languageContributor,
  // G-FORMAT: Title, Subtitle, Heading 1–4, Quote, Caption and Code as Word styles matching the editor.
  namedStylesContributor,
  // @phase4:docx-document — add document-level options (comments, sections, styles) here.
  // G-LAYOUT: sections (breaks, orientation, columns, page numbering) and header/footer parts.
  layoutContributor,
];
