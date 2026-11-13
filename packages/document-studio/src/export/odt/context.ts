import type { JSONContent } from '@tiptap/core';
import type { DocumentContent } from '../../types';
import type { ExportReport } from '../report';
import { el } from './xml';

/**
 * ODF formatting properties by attribute name, e.g. { 'fo:font-weight': 'bold' }. Mark handlers fill text
 * properties; paragraph contributors fill paragraph properties. Any ODF property can be set, so new features need
 * no change here.
 */
export type OdfProps = Record<string, string>;

/**
 * The automatic styles of content.xml: one style per distinct set of properties, named P1, T1, … in the order
 * first used, so the same document always produces the same file.
 */
export class AutoStyles {
  private readonly names = new Map<string, string>();
  private readonly counters = new Map<string, number>();
  private readonly xml: string[] = [];

  /**
   * The name of the automatic style with these properties (created when first asked for).
   * `body` is the style's child elements, e.g. `<style:paragraph-properties …/>`.
   */
  get(family: string, prefix: string, body: string, extra: Record<string, string | undefined> = {}): string {
    const key = `${family}|${prefix}|${JSON.stringify(extra)}|${body}`;
    const existing = this.names.get(key);
    if (existing) return existing;
    const n = (this.counters.get(prefix) ?? 0) + 1;
    this.counters.set(prefix, n);
    const name = `${prefix}${n}`;
    this.names.set(key, name);
    this.xml.push(el('style:style', { 'style:name': name, 'style:family': family, ...extra }, body));
    return name;
  }

  /** Adds a complete style element (e.g. a list style) under a name chosen by the caller, once. */
  raw(key: string, make: () => { name: string; xml: string }): string {
    const existing = this.names.get(key);
    if (existing) return existing;
    const { name, xml } = make();
    this.names.set(key, name);
    this.xml.push(xml);
    return name;
  }

  /**
   * A paragraph style deriving from `parent` with these paragraph and text properties (`parent` itself when there
   * are none). `extra` adds style attributes, such as style:master-page-name.
   */
  paragraph(parent: string, paragraph: OdfProps = {}, text: OdfProps = {}, extra: Record<string, string> = {}): string {
    const body = propsEl('style:paragraph-properties', paragraph) + propsEl('style:text-properties', text);
    if (!body && !Object.keys(extra).length) return parent;
    return this.get('paragraph', 'P', body, { 'style:parent-style-name': parent, ...extra });
  }

  /** A text style with these properties, or null when there are none. */
  text(props: OdfProps): string | null {
    const body = propsEl('style:text-properties', props);
    return body ? this.get('text', 'T', body) : null;
  }

  toXml() {
    return this.xml.join('');
  }
}

/** `<name a="…"/>` for a set of properties, or '' when there are none. Keys are sorted, so equal sets match. */
export function propsEl(name: string, props: OdfProps): string {
  const keys = Object.keys(props).sort();
  if (!keys.length) return '';
  return el(name, Object.fromEntries(keys.map((k) => [k, props[k]])));
}

/** State shared by every handler while one document is converted. */
export interface OdtCtx {
  content: DocumentContent;
  /** Text width in CSS pixels, for scaling pictures (narrower inside table cells). */
  contentWidthPx: number;
  styles: AutoStyles;
  /** Pictures to store in the package, by path (Pictures/…). */
  pictures: Map<string, { data: Uint8Array; mime: string }>;
  /** Diagram previews, by attachment id. */
  assets: Map<string, Uint8Array>;
  headings: Array<{ level: number; text: string }>;
  report: ExportReport;
  /** Paragraph style that plain paragraphs derive from here (Standard; Table_20_Contents inside cells …). */
  paragraphStyle: string;
  /** True inside a table cell. */
  inCell?: boolean;
  /** The cell's own alignment (table cell attribute `align`), for paragraphs without one. */
  cellAlign?: string;
  /** The first page's number (G-LAYOUT), set on the first paragraph and then cleared. */
  pageNumberStart?: number;
  /** True inside a list item, where ODF allows no sections (text:list-item holds paragraphs, headings and lists). */
  inListItem?: boolean;
  /** Counters for unique names (tables, frames, lists, the sections around quotes and code blocks). */
  ids: { table: number; frame: number; picture: number; toc: number; list: number; quote: number; code: number };
}

/** The converters, handed to every handler so handlers can recurse without importing each other. */
export interface OdtApi {
  /** Block nodes as ODF block content. */
  blocks(nodes: JSONContent[] | undefined, ctx: OdtCtx): string;
  /** Inline content as paragraph content; `base` text properties apply to every run (e.g. a quote's colour). */
  inlines(nodes: JSONContent[] | undefined, ctx: OdtCtx, base?: OdfProps): string;
  /** A paragraph-like node (paragraph, list paragraph …): its paragraph properties, then the element. */
  paragraph(node: JSONContent, ctx: OdtCtx, opts?: { element?: 'text:p' | 'text:h'; parent?: string; level?: number; paragraph?: OdfProps; base?: OdfProps }): string;
}

/** Converts one block node to ODF block content. Registered by node type in nodes.ts. */
export type OdtNodeHandler = (node: JSONContent, ctx: OdtCtx, api: OdtApi) => string;
/** Converts one inline node (other than text). Registered in inlines.ts. */
export type OdtInlineHandler = (node: JSONContent, ctx: OdtCtx, base: OdfProps, api: OdtApi, state: { atStart: boolean }) => string;
/** Adds one mark's formatting to a run's text properties. Registered by mark type in marks.ts. */
export type OdtMarkHandler = (props: OdfProps, attrs: Record<string, unknown>, ctx: OdtCtx) => void;
/** Adds paragraph properties from a block node's attributes (alignment, spacing …). Registered in paragraph.ts. */
export type OdtParagraphContributor = (props: OdfProps, node: JSONContent, ctx: OdtCtx) => void;
