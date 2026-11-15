/**
 * Presentation content, schema 1 (Phase 7, ADR 0014). This is the whole model: every later group (editor, design,
 * content, show, export) works on these types and adds no top-level shape of its own.
 *
 * Rules every field follows:
 * - Sizes and positions are CSS pixels on a slide of `size` (96 px = 1 inch, so 960 × 540 is 10 × 5.625 in, the
 *   PowerPoint/PptxGenJS 16:9 layout). Font sizes are points.
 * - Attachment ids (images, picture backgrounds, diagram previews) are stored as their own string values, never inside
 *   a larger string, so attachment clean-up always sees them (local-storage collectReferences).
 * - Colours are '#rrggbb' or a theme slot reference, so a theme change recolours everything that follows the theme.
 * - Rich text is Tiptap JSON limited to the vocabulary frozen in compat.ts.
 * - Optional fields are left out rather than written as undefined; `null` is only used where a type says so.
 */

/** Newest presentation content schema this build reads and writes. */
export const PRESENTATION_SCHEMA = 1;

// ── Slide size ────────────────────────────────────────────────────────────────────────────────────

export type SlideSizeId = '16:9' | '4:3';
export type PresentationSize = { width: 960; height: 540 } | { width: 960; height: 720 };
export const SLIDE_SIZES: Readonly<Record<SlideSizeId, PresentationSize>> = {
  '16:9': { width: 960, height: 540 },
  '4:3': { width: 960, height: 720 },
};
export const sizeIdOf = (size: PresentationSize): SlideSizeId => (size.height === 720 ? '4:3' : '16:9');

// ── Colours, fills and lines ──────────────────────────────────────────────────────────────────────

/** Theme colour slots, named as in OOXML themes (dk1, lt1, …) so they map to PPTX one to one. */
export type ThemeColorSlot = 'dark1' | 'light1' | 'dark2' | 'light2' | 'accent1' | 'accent2' | 'accent3' | 'accent4' | 'accent5' | 'accent6' | 'hyperlink';
export const THEME_COLOR_SLOTS: readonly ThemeColorSlot[] = ['dark1', 'light1', 'dark2', 'light2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hyperlink'];

/** A colour: '#rrggbb', or a theme slot. */
export type Color = string | { theme: ThemeColorSlot };

export interface GradientStop {
  /** 0–1 along the gradient. */
  position: number;
  color: Color;
}

export type Fill =
  | { type: 'none' }
  | { type: 'solid'; color: Color; /** 0–1; 1 when left out. */ opacity?: number }
  /** Linear gradient; `angle` in degrees, 0 = left to right, 90 = top to bottom (as in OOXML a:lin). */
  | { type: 'gradient'; angle: number; stops: GradientStop[] }
  | { type: 'image'; attachmentId: string; fit: 'cover' | 'contain' | 'stretch' };

export type FillType = Fill['type'];
/** A slide, layout or master background. 'none' is not a background: the slide then shows its layout's or master's. */
export type Background = Exclude<Fill, { type: 'none' }>;

export type LineDash = 'solid' | 'dash' | 'dot' | 'dashDot';
export type Arrowhead = 'none' | 'arrow' | 'triangle' | 'oval';

export interface Line {
  color: Color;
  /** Points. */
  width: number;
  dash: LineDash;
  /** Line shapes only: the marker at the start and at the end. */
  headEnd?: Arrowhead;
  tailEnd?: Arrowhead;
}

// ── Theme ─────────────────────────────────────────────────────────────────────────────────────────

export interface ThemeFonts {
  /** Font family names. Stacks are not stored; renderers add a generic fallback. */
  heading: string;
  body: string;
}

export interface PresentationTheme {
  id: string;
  name: string;
  colors: Record<ThemeColorSlot, string>;
  fonts: ThemeFonts;
}

// ── Rich text (Tiptap JSON, frozen vocabulary in compat.ts) ─────────────────────────────────────────

export type TextAlign = 'left' | 'center' | 'right' | 'justify';

export type RichMark =
  | { type: 'bold' }
  | { type: 'italic' }
  | { type: 'underline' }
  | { type: 'strike' }
  | { type: 'subscript' }
  | { type: 'superscript' }
  | { type: 'link'; attrs: { href: string } }
  | { type: 'highlight'; attrs: { color: string | null } }
  /** Any attribute left null follows the text box style. `fontSize` is in points, e.g. '24pt'. */
  | { type: 'textStyle'; attrs: { color?: string | null; fontFamily?: string | null; fontSize?: string | null } };

export interface RichTextNode {
  type: 'text';
  text: string;
  marks?: RichMark[];
}
export interface RichHardBreak {
  type: 'hardBreak';
}
export type RichInline = RichTextNode | RichHardBreak;

export interface RichParagraph {
  type: 'paragraph';
  attrs?: { textAlign?: TextAlign | null };
  content?: RichInline[];
}
export interface RichListItem {
  type: 'listItem';
  content: Array<RichParagraph | RichBulletList | RichOrderedList>;
}
export interface RichBulletList {
  type: 'bulletList';
  content: RichListItem[];
}
export interface RichOrderedList {
  type: 'orderedList';
  attrs?: { start?: number };
  content: RichListItem[];
}
export type RichBlock = RichParagraph | RichBulletList | RichOrderedList;

export interface RichTextDoc {
  type: 'doc';
  content: RichBlock[];
}

// ── Text box style ────────────────────────────────────────────────────────────────────────────────

/** 'heading' and 'body' follow the theme fonts; anything else is a font family name. */
export type FontRef = 'heading' | 'body' | string;
export type VerticalAlign = 'top' | 'middle' | 'bottom';
/** none = text may overflow; shrink = text shrinks to fit the box; resize = the box grows with the text. */
export type Autofit = 'none' | 'shrink' | 'resize';

export interface TextStyle {
  font: FontRef;
  /** Points. */
  fontSize: number;
  color: Color;
  bold: boolean;
  italic: boolean;
  align: TextAlign;
  verticalAlign: VerticalAlign;
  autofit: Autofit;
  /** Line height as a multiple of the font size (1.0–3.0). */
  lineSpacing: number;
  /** Inner margins in px: top, right, bottom, left. */
  padding: [number, number, number, number];
}

// ── Animations and transitions ────────────────────────────────────────────────────────────────────

/** Entrance effects only: the ones PPTX and the slide show can both play. */
export type AnimationEffect = 'appear' | 'fade' | 'fly-in' | 'zoom' | 'wipe';
export type AnimationTrigger = 'on-click' | 'with-previous' | 'after-previous';
export type Direction = 'left' | 'right' | 'up' | 'down';

export interface Animation {
  effect: AnimationEffect;
  /** Position in the slide's animation sequence, 1-based. Elements without an animation are on the slide from the start. */
  order: number;
  trigger: AnimationTrigger;
  /** Milliseconds. */
  duration: number;
  /** Milliseconds after the trigger. */
  delay?: number;
  /** fly-in and wipe: where the element comes from. */
  direction?: Direction;
}

export type TransitionType = 'none' | 'fade' | 'push' | 'wipe' | 'cover' | 'split' | 'zoom';

export interface Transition {
  type: TransitionType;
  /** Milliseconds. */
  duration: number;
  /** push, wipe and cover: the direction the new slide moves in. */
  direction?: Direction;
  /** split: the axis the slide opens along. */
  orientation?: 'horizontal' | 'vertical';
}

// ── Elements ──────────────────────────────────────────────────────────────────────────────────────

export interface ElementBase {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Degrees clockwise, 0–359. */
  rotation: number;
  locked?: boolean;
  /** Name shown in the selection pane and as the PPTX object name. */
  name?: string;
  animation?: Animation;
  /** The layout placeholder this element fills; layout changes flow to it, and it keeps its slot on a layout change. */
  placeholderId?: string;
}

export interface TextElement extends ElementBase {
  type: 'text';
  text: RichTextDoc;
  style: TextStyle;
  /** Box fill and outline (none by default). */
  fill?: Fill;
  line?: Line | null;
}

export interface ImageCrop {
  /** Fractions (0–1) cut from each side of the original picture. */
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface ImageElement extends ElementBase {
  type: 'image';
  attachmentId: string;
  mimeType: string;
  naturalWidth: number;
  naturalHeight: number;
  /** How the (cropped) picture fills the box. */
  fit: 'contain' | 'cover' | 'stretch';
  crop?: ImageCrop;
  /** Alternative text, read by screen readers and written to exports. '' = decorative. */
  alt: string;
}

/** Shapes that map one to one to PPTX preset geometries (a:prstGeom prst). */
export type ShapePreset =
  | 'rect'
  | 'roundRect'
  | 'ellipse'
  | 'triangle'
  | 'rtTriangle'
  | 'diamond'
  | 'parallelogram'
  | 'trapezoid'
  | 'pentagon'
  | 'hexagon'
  | 'octagon'
  | 'chevron'
  | 'rightArrow'
  | 'leftArrow'
  | 'upArrow'
  | 'downArrow'
  | 'leftRightArrow'
  | 'line'
  | 'star5'
  | 'plus'
  | 'heart'
  | 'wedgeRectCallout'
  | 'wedgeRoundRectCallout';
export const SHAPE_PRESETS: readonly ShapePreset[] = [
  'rect', 'roundRect', 'ellipse', 'triangle', 'rtTriangle', 'diamond', 'parallelogram', 'trapezoid', 'pentagon', 'hexagon', 'octagon', 'chevron',
  'rightArrow', 'leftArrow', 'upArrow', 'downArrow', 'leftRightArrow', 'line', 'star5', 'plus', 'heart', 'wedgeRectCallout', 'wedgeRoundRectCallout',
];

export interface ShapeElement extends ElementBase {
  type: 'shape';
  preset: ShapePreset;
  fill: Fill;
  line: Line | null;
  /** Text inside the shape (not for 'line'). */
  text?: RichTextDoc;
  textStyle?: TextStyle;
  flipH?: boolean;
  flipV?: boolean;
}

export interface CellBorders {
  top?: Line | null;
  right?: Line | null;
  bottom?: Line | null;
  left?: Line | null;
}

export interface TableCell {
  text: RichTextDoc;
  fill?: Color;
  align?: TextAlign;
  verticalAlign?: VerticalAlign;
  borders?: CellBorders;
  /** The top-left cell of a merged block spans this many columns and rows. */
  colSpan?: number;
  rowSpan?: number;
  /** Covered by another cell's span: kept so every row has one cell per column, never shown. */
  merged?: boolean;
}

export interface TableRow {
  /** px */
  height: number;
  cells: TableCell[];
}

export interface TableStyle {
  headerRow: boolean;
  bandedRows: boolean;
  firstColumn: boolean;
  /** Fill of ordinary cells, the header row and banded rows. */
  fill: Color;
  headerFill: Color;
  bandFill: Color;
  headerTextColor: Color;
  border: Line | null;
  /** Default text style of every cell. */
  text: TextStyle;
}

export interface TableElement extends ElementBase {
  type: 'table';
  /** Column widths in px; their sum is the table width. */
  columns: number[];
  rows: TableRow[];
  style: TableStyle;
}

export type ChartType = 'bar' | 'column' | 'line' | 'pie' | 'doughnut';
export const CHART_TYPES: readonly ChartType[] = ['bar', 'column', 'line', 'pie', 'doughnut'];
export type LegendPosition = 'none' | 'top' | 'bottom' | 'left' | 'right';

export interface ChartSeries {
  name: string;
  /** One value per category; null = no value. */
  values: Array<number | null>;
  /** Left out = the theme accent for its position. */
  color?: Color;
}

export interface ChartElement extends ElementBase {
  type: 'chart';
  chartType: ChartType;
  categories: string[];
  series: ChartSeries[];
  title: string;
  showTitle: boolean;
  legend: LegendPosition;
  showValues: boolean;
  /** bar and column: stack the series. */
  stacked?: boolean;
  /** pie and doughnut: one colour per category (left out = theme accents). */
  categoryColors?: Color[];
  font: FontRef;
  /** Points. */
  fontSize: number;
  textColor: Color;
}

/**
 * An editable diagram from Diagram Studio. The fields are exactly the document `diagram` node's attributes (document-
 * studio DiagramAttrs: source, previewId, naturalWidth, naturalHeight, title, alt, svgPreviewId), so the Phase 6
 * diagram export helpers apply unchanged (see diagramNodeAttrs). The element's w and h are its size on the slide.
 */
export interface DiagramElement extends ElementBase {
  type: 'diagram';
  /** Diagram Studio content; stored as it is and never changed by Presentation Studio. */
  source: unknown;
  /** Attachment id of the PNG preview ('' when none was stored yet). */
  previewId: string;
  naturalWidth: number;
  naturalHeight: number;
  title: string;
  alt: string | null;
  svgPreviewId: string | null;
}

export type SlideElement = TextElement | ImageElement | ShapeElement | TableElement | ChartElement | DiagramElement;
export type ElementType = SlideElement['type'];
export const ELEMENT_TYPES: readonly ElementType[] = ['text', 'image', 'shape', 'table', 'chart', 'diagram'];

// ── Placeholders, layouts and masters ───────────────────────────────────────────────────────────────

export type PlaceholderKind = 'title' | 'subtitle' | 'body' | 'picture' | 'chart' | 'table' | 'footer' | 'date' | 'slideNumber';
export const PLACEHOLDER_KINDS: readonly PlaceholderKind[] = ['title', 'subtitle', 'body', 'picture', 'chart', 'table', 'footer', 'date', 'slideNumber'];

export interface Placeholder {
  /** Unique within its layout or master ('title', 'body', 'left', …). Slide elements refer to it by this id. */
  id: string;
  kind: PlaceholderKind;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Shown in the editor only, never in exports or the slide show. */
  prompt: string;
  style: TextStyle;
}

export type LayoutKind = 'title' | 'titleContent' | 'twoContent' | 'sectionHeader' | 'titleOnly' | 'blank' | 'comparison' | 'pictureCaption';
export const LAYOUT_KINDS: readonly LayoutKind[] = ['title', 'titleContent', 'twoContent', 'sectionHeader', 'titleOnly', 'blank', 'comparison', 'pictureCaption'];

export interface SlideMaster {
  id: string;
  name: string;
  background: Background;
  /** Placeholders every layout of this master starts from (title, body, footer, date, slide number). */
  placeholders: Placeholder[];
  /** Shapes and pictures drawn behind every slide of this master. Never placeholders. */
  decorations: SlideElement[];
}

export interface SlideLayout {
  id: string;
  masterId: string;
  name: string;
  kind: LayoutKind;
  /** Left out = the master's background. */
  background?: Background;
  placeholders: Placeholder[];
  decorations: SlideElement[];
  /** Whether the master's decorations show behind slides of this layout. */
  showMasterDecorations: boolean;
}

// ── Slides and the presentation ───────────────────────────────────────────────────────────────────

export interface Slide {
  id: string;
  layoutId: string;
  /** Left out = the layout's (else the master's) background. */
  background?: Background;
  /** Drawn in order: later elements are in front. */
  elements: SlideElement[];
  /** Speaker notes. */
  notes: RichTextDoc;
  /** How this slide comes in during the slide show. Left out = none. */
  transition?: Transition;
  /** Skipped in the slide show (still exported, marked hidden in PPTX). */
  hidden?: boolean;
}

export interface PresentationContent {
  schemaVersion: 1;
  size: PresentationSize;
  /** The built-in theme `theme` was taken from, or 'custom'. */
  themeId: string;
  /** The theme in use, stored in full so a presentation looks the same everywhere. */
  theme: PresentationTheme;
  masters: SlideMaster[];
  layouts: SlideLayout[];
  slides: Slide[];
}

// ── Small helpers every group uses ────────────────────────────────────────────────────────────────

/** An empty rich text document (one empty paragraph). */
export const emptyRichText = (): RichTextDoc => ({ type: 'doc', content: [{ type: 'paragraph' }] });

/** Plain text as rich text: one paragraph per line. */
export function richTextFromPlain(text: string, align?: TextAlign): RichTextDoc {
  const lines = text.split('\n');
  return {
    type: 'doc',
    content: lines.map((line) => ({
      type: 'paragraph',
      ...(align ? { attrs: { textAlign: align } } : {}),
      ...(line ? { content: [{ type: 'text', text: line }] } : {}),
    })),
  };
}

/** The text of rich text, one line per paragraph or list item. */
export function plainTextOf(doc: RichTextDoc | undefined): string {
  if (!doc) return '';
  const lines: string[] = [];
  const inline = (nodes: RichInline[] | undefined) => (nodes ?? []).map((n) => (n.type === 'text' ? n.text : '\n')).join('');
  const block = (b: RichBlock | RichListItem) => {
    if (b.type === 'paragraph') lines.push(inline(b.content));
    else for (const c of b.content) block(c as RichBlock | RichListItem);
  };
  for (const b of doc.content) block(b);
  return lines.join('\n');
}

/** Whether rich text holds no visible text. */
export const isEmptyRichText = (doc: RichTextDoc | undefined) => plainTextOf(doc).trim() === '';

/** The attributes of a document-studio `diagram` node for a slide diagram, for the Phase 6 diagram export helpers. */
export function diagramNodeAttrs(el: DiagramElement) {
  return {
    source: el.source,
    previewId: el.previewId,
    naturalWidth: el.naturalWidth,
    naturalHeight: el.naturalHeight,
    width: el.w,
    height: el.h,
    title: el.title,
    align: null,
    caption: null,
    alt: el.alt,
    svgPreviewId: el.svgPreviewId,
  };
}
