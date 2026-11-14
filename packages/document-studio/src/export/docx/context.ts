import type { JSONContent } from '@tiptap/core';
import type { IRunOptions, Paragraph, ParagraphChild, Table, TableOfContents } from 'docx';
import type { DocumentContent } from '../../types';
import type { DiagramPicture, DiagramRenders } from '../diagramAssets';
import type { ExportReport } from '../report';

/** A block-level piece of the Word body. (A table cell takes only paragraphs and tables: see ctx.inCell.) */
export type Block = Paragraph | Table | TableOfContents;

export type RunStyle = { -readonly [K in keyof IRunOptions]?: IRunOptions[K] };

/** State shared by every handler while one document is converted. */
export interface Ctx {
  /** The document being exported. */
  content: DocumentContent;
  /** Usable text width in pixels (96 dpi), for scaling images. */
  contentWidthPx: number;
  listInstance: number;
  headings: Array<{ level: number; text: string }>;
  /** Preview images of embedded diagrams, by attachment id. */
  assets: Map<string, Uint8Array>;
  /** Phase 6: diagram drawings made at export time (missing previews, SVG), by diagramKey. */
  diagramRenders?: DiagramRenders;
  /** Phase 6: what was written for each diagram (diagramPicture), so copies are written with the same bytes. */
  diagramPictures?: Map<string, DiagramPicture | null>;
  /** Start numbers of numbered lists that do not start at 1. */
  orderedStarts: Set<number>;
  /** Approximations and placeholders, shown to the user after the export. */
  report: ExportReport;
  /** True while converting the content of a table cell, where Word allows only paragraphs and tables. */
  inCell?: boolean;
  /**
   * The next bookmark id (w:id) of this document. Bookmarks must take their ids from here, never from docx's
   * `Bookmark` class, whose ids come from a counter shared by every export in the session: the same document would
   * then be written differently each time. The headings' table-of-contents bookmarks use it too (see buildDocx).
   */
  bookmarkId(): number;
}

/** The converters, handed to every handler so handlers can recurse without importing each other. */
export interface DocxApi {
  blocks(nodes: JSONContent[], ctx: Ctx): Block[];
  inlines(nodes: JSONContent[] | undefined, ctx: Ctx, extra?: RunStyle): ParagraphChild[];
}

/** Converts one block node. Registered by node type name in nodes.ts. */
export type NodeHandler = (node: JSONContent, ctx: Ctx, api: DocxApi) => Block[];
/** Converts one inline node (text is handled separately). Registered in inlines.ts. */
export type InlineHandler = (node: JSONContent, ctx: Ctx, extra: RunStyle, api: DocxApi) => ParagraphChild[];
/** Adds one mark's formatting to a run. Registered by mark type name in marks.ts. Later marks win. */
export type MarkHandler = (style: RunStyle, attrs: Record<string, unknown>, ctx: Ctx) => void;
