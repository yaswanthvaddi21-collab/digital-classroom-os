/**
 * Presentation content schema 1 (Phase 7, ADR 0014): everything this build can store, frozen.
 *
 * A presentation that uses anything outside this vocabulary (a field, an element type, a shape, a transition…) was
 * written by a newer version of the app. This build opens it read-only (protected view) and never saves over it,
 * so nothing a newer version wrote is lost. A later phase that adds to the model appends a new content schema and
 * measures new content against this vocabulary, as documents and diagrams do (document-studio compat.ts,
 * diagram-studio compat.ts).
 *
 * NEVER EDIT once Phase 7 is released. Until then, Round 2 groups may append what their part of the model needs,
 * recording it in ADR 0014. Values are written out here (not imported from types.ts) so a change to the types can
 * never change the vocabulary by accident.
 */
export const PRESENTATION_V1_VOCABULARY = Object.freeze({
  contentFields: ['schemaVersion', 'size', 'themeId', 'theme', 'masters', 'layouts', 'slides'],
  sizes: [
    [960, 540],
    [960, 720],
  ],
  sizeFields: ['width', 'height'],
  themeFields: ['id', 'name', 'colors', 'fonts'],
  themeColorSlots: ['dark1', 'light1', 'dark2', 'light2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hyperlink'],
  fontFields: ['heading', 'body'],
  colorRefFields: ['theme'],
  masterFields: ['id', 'name', 'background', 'placeholders', 'decorations'],
  layoutFields: ['id', 'masterId', 'name', 'kind', 'background', 'placeholders', 'decorations', 'showMasterDecorations'],
  layoutKinds: ['title', 'titleContent', 'twoContent', 'sectionHeader', 'titleOnly', 'blank', 'comparison', 'pictureCaption'],
  placeholderFields: ['id', 'kind', 'x', 'y', 'w', 'h', 'prompt', 'style'],
  placeholderKinds: ['title', 'subtitle', 'body', 'picture', 'chart', 'table', 'footer', 'date', 'slideNumber'],
  slideFields: ['id', 'layoutId', 'background', 'elements', 'notes', 'transition', 'hidden'],
  elementFields: ['id', 'type', 'x', 'y', 'w', 'h', 'rotation', 'locked', 'name', 'animation', 'placeholderId'],
  elementTypes: {
    text: ['text', 'style', 'fill', 'line'],
    image: ['attachmentId', 'mimeType', 'naturalWidth', 'naturalHeight', 'fit', 'crop', 'alt'],
    shape: ['preset', 'fill', 'line', 'text', 'textStyle', 'flipH', 'flipV'],
    table: ['columns', 'rows', 'style'],
    chart: ['chartType', 'categories', 'series', 'title', 'showTitle', 'legend', 'showValues', 'stacked', 'categoryColors', 'font', 'fontSize', 'textColor'],
    diagram: ['source', 'previewId', 'naturalWidth', 'naturalHeight', 'title', 'alt', 'svgPreviewId'],
  },
  textStyleFields: ['font', 'fontSize', 'color', 'bold', 'italic', 'align', 'verticalAlign', 'autofit', 'lineSpacing', 'padding'],
  textAligns: ['left', 'center', 'right', 'justify'],
  verticalAligns: ['top', 'middle', 'bottom'],
  autofits: ['none', 'shrink', 'resize'],
  fillTypes: {
    none: [],
    solid: ['color', 'opacity'],
    gradient: ['angle', 'stops'],
    image: ['attachmentId', 'fit'],
  },
  gradientStopFields: ['position', 'color'],
  backgroundFits: ['cover', 'contain', 'stretch'],
  imageFits: ['contain', 'cover', 'stretch'],
  cropFields: ['left', 'top', 'right', 'bottom'],
  lineFields: ['color', 'width', 'dash', 'headEnd', 'tailEnd'],
  lineDashes: ['solid', 'dash', 'dot', 'dashDot'],
  arrowheads: ['none', 'arrow', 'triangle', 'oval'],
  shapePresets: [
    'rect', 'roundRect', 'ellipse', 'triangle', 'rtTriangle', 'diamond', 'parallelogram', 'trapezoid', 'pentagon', 'hexagon', 'octagon', 'chevron',
    'rightArrow', 'leftArrow', 'upArrow', 'downArrow', 'leftRightArrow', 'line', 'star5', 'plus', 'heart', 'wedgeRectCallout', 'wedgeRoundRectCallout',
  ],
  tableRowFields: ['height', 'cells'],
  tableCellFields: ['text', 'fill', 'align', 'verticalAlign', 'borders', 'colSpan', 'rowSpan', 'merged'],
  cellBorderFields: ['top', 'right', 'bottom', 'left'],
  tableStyleFields: ['headerRow', 'bandedRows', 'firstColumn', 'fill', 'headerFill', 'bandFill', 'headerTextColor', 'border', 'text'],
  chartTypes: ['bar', 'column', 'line', 'pie', 'doughnut'],
  legendPositions: ['none', 'top', 'bottom', 'left', 'right'],
  seriesFields: ['name', 'values', 'color'],
  transitionFields: ['type', 'duration', 'direction', 'orientation'],
  transitionTypes: ['none', 'fade', 'push', 'wipe', 'cover', 'split', 'zoom'],
  directions: ['left', 'right', 'up', 'down'],
  orientations: ['horizontal', 'vertical'],
  animationFields: ['effect', 'order', 'trigger', 'duration', 'delay', 'direction'],
  animationEffects: ['appear', 'fade', 'fly-in', 'zoom', 'wipe'],
  animationTriggers: ['on-click', 'with-previous', 'after-previous'],
  /** Rich text: Tiptap JSON with these node and mark types and attributes only. */
  richText: {
    nodeFields: ['type', 'attrs', 'content', 'text', 'marks'],
    nodes: { doc: [], paragraph: ['textAlign'], text: [], hardBreak: [], bulletList: [], orderedList: ['start'], listItem: [] },
    markFields: ['type', 'attrs'],
    marks: { bold: [], italic: [], underline: [], strike: [], subscript: [], superscript: [], link: ['href'], highlight: ['color'], textStyle: ['color', 'fontFamily', 'fontSize'] },
  },
} as const);

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const V = PRESENTATION_V1_VOCABULARY;
const has = (list: readonly string[], v: unknown) => typeof v === 'string' && list.includes(v);

/**
 * Where `content` uses something outside the schema-1 vocabulary, or null when it uses only that. Only fields and
 * closed sets of values are compared here; whether the values are well formed is safety.ts's job. A field outside the
 * vocabulary counts only when it holds something (JSON drops undefined; a null attribute is a default).
 */
export function presentationNovelty(content: unknown): string | null {
  if (!isObj(content)) return null;
  const found: string[] = [];
  const fields = (o: unknown, known: readonly string[], at: string) => {
    if (!isObj(o)) return;
    for (const [k, v] of Object.entries(o)) if (!known.includes(k) && v !== undefined) found.push(`${at}: unknown field “${k}”`);
  };
  const value = (v: unknown, known: readonly string[], at: string) => {
    if (v !== undefined && !has(known, v)) found.push(`${at}: unknown value ${JSON.stringify(v)}`);
  };
  const color = (c: unknown, at: string) => {
    if (isObj(c)) {
      fields(c, V.colorRefFields, at);
      value(c.theme, V.themeColorSlots, `${at}.theme`);
    }
  };
  const line = (l: unknown, at: string) => {
    if (!isObj(l)) return;
    fields(l, V.lineFields, at);
    color(l.color, `${at}.color`);
    value(l.dash, V.lineDashes, `${at}.dash`);
    value(l.headEnd, V.arrowheads, `${at}.headEnd`);
    value(l.tailEnd, V.arrowheads, `${at}.tailEnd`);
  };
  const fill = (f: unknown, at: string, fits: readonly string[] = V.backgroundFits) => {
    if (!isObj(f)) return;
    const type = f.type as keyof typeof V.fillTypes;
    if (!has(Object.keys(V.fillTypes), type)) return void found.push(`${at}: unknown fill ${JSON.stringify(f.type)}`);
    fields(f, ['type', ...V.fillTypes[type]], at);
    color(f.color, `${at}.color`);
    if (type === 'image') value(f.fit, fits, `${at}.fit`);
    if (Array.isArray(f.stops)) f.stops.forEach((s, i) => (fields(s, V.gradientStopFields, `${at}.stops[${i}]`), isObj(s) && color(s.color, `${at}.stops[${i}].color`)));
  };
  const text = (doc: unknown, at: string) => {
    const node = (n: unknown, where: string) => {
      if (!isObj(n)) return;
      fields(n, V.richText.nodeFields, where);
      const type = n.type as keyof typeof V.richText.nodes;
      if (!has(Object.keys(V.richText.nodes), type)) return void found.push(`${where}: unknown text node ${JSON.stringify(n.type)}`);
      if (isObj(n.attrs)) for (const [k, v] of Object.entries(n.attrs)) if (!(V.richText.nodes[type] as readonly string[]).includes(k) && v != null) found.push(`${where}: unknown attribute “${k}”`);
      if (type === 'paragraph' && isObj(n.attrs) && n.attrs.textAlign != null) value(n.attrs.textAlign, V.textAligns, `${where}.attrs.textAlign`);
      if (Array.isArray(n.marks))
        n.marks.forEach((m, i) => {
          if (!isObj(m)) return;
          fields(m, V.richText.markFields, `${where}.marks[${i}]`);
          const mt = m.type as keyof typeof V.richText.marks;
          if (!has(Object.keys(V.richText.marks), mt)) return void found.push(`${where}.marks[${i}]: unknown mark ${JSON.stringify(m.type)}`);
          if (isObj(m.attrs)) for (const [k, v] of Object.entries(m.attrs)) if (!(V.richText.marks[mt] as readonly string[]).includes(k) && v != null) found.push(`${where}.marks[${i}]: unknown attribute “${k}”`);
        });
      if (Array.isArray(n.content)) n.content.forEach((c, i) => node(c, `${where}.content[${i}]`));
    };
    node(doc, at);
  };
  const style = (s: unknown, at: string) => {
    if (!isObj(s)) return;
    fields(s, V.textStyleFields, at);
    color(s.color, `${at}.color`);
    value(s.align, V.textAligns, `${at}.align`);
    value(s.verticalAlign, V.verticalAligns, `${at}.verticalAlign`);
    value(s.autofit, V.autofits, `${at}.autofit`);
  };
  const placeholder = (p: unknown, at: string) => {
    if (!isObj(p)) return;
    fields(p, V.placeholderFields, at);
    value(p.kind, V.placeholderKinds, `${at}.kind`);
    style(p.style, `${at}.style`);
  };
  const element = (e: unknown, at: string) => {
    if (!isObj(e)) return;
    const type = e.type as keyof typeof V.elementTypes;
    if (!has(Object.keys(V.elementTypes), type)) return void found.push(`${at}: unknown element type ${JSON.stringify(e.type)}`);
    fields(e, [...V.elementFields, ...V.elementTypes[type]], at);
    if (isObj(e.animation)) {
      fields(e.animation, V.animationFields, `${at}.animation`);
      value(e.animation.effect, V.animationEffects, `${at}.animation.effect`);
      value(e.animation.trigger, V.animationTriggers, `${at}.animation.trigger`);
      value(e.animation.direction, V.directions, `${at}.animation.direction`);
    }
    if (type === 'text') {
      text(e.text, `${at}.text`);
      style(e.style, `${at}.style`);
      fill(e.fill, `${at}.fill`);
      line(e.line, `${at}.line`);
    } else if (type === 'image') {
      value(e.fit, V.imageFits, `${at}.fit`);
      fields(e.crop, V.cropFields, `${at}.crop`);
    } else if (type === 'shape') {
      value(e.preset, V.shapePresets, `${at}.preset`);
      fill(e.fill, `${at}.fill`);
      line(e.line, `${at}.line`);
      text(e.text, `${at}.text`);
      style(e.textStyle, `${at}.textStyle`);
    } else if (type === 'table') {
      if (isObj(e.style)) {
        fields(e.style, V.tableStyleFields, `${at}.style`);
        for (const k of ['fill', 'headerFill', 'bandFill', 'headerTextColor']) color(e.style[k], `${at}.style.${k}`);
        line(e.style.border, `${at}.style.border`);
        style(e.style.text, `${at}.style.text`);
      }
      if (Array.isArray(e.rows))
        e.rows.forEach((r, i) => {
          fields(r, V.tableRowFields, `${at}.rows[${i}]`);
          if (isObj(r) && Array.isArray(r.cells))
            r.cells.forEach((c, j) => {
              const where = `${at}.rows[${i}].cells[${j}]`;
              if (!isObj(c)) return;
              fields(c, V.tableCellFields, where);
              text(c.text, `${where}.text`);
              color(c.fill, `${where}.fill`);
              value(c.align, V.textAligns, `${where}.align`);
              value(c.verticalAlign, V.verticalAligns, `${where}.verticalAlign`);
              if (isObj(c.borders)) {
                fields(c.borders, V.cellBorderFields, `${where}.borders`);
                for (const side of V.cellBorderFields) line(c.borders[side], `${where}.borders.${side}`);
              }
            });
        });
    } else if (type === 'chart') {
      value(e.chartType, V.chartTypes, `${at}.chartType`);
      value(e.legend, V.legendPositions, `${at}.legend`);
      color(e.textColor, `${at}.textColor`);
      if (Array.isArray(e.series)) e.series.forEach((s, i) => (fields(s, V.seriesFields, `${at}.series[${i}]`), isObj(s) && color(s.color, `${at}.series[${i}].color`)));
      if (Array.isArray(e.categoryColors)) e.categoryColors.forEach((c, i) => color(c, `${at}.categoryColors[${i}]`));
    }
  };
  const decorated = (o: Obj, at: string) => {
    if (o.background !== undefined) fill(o.background, `${at}.background`);
    if (Array.isArray(o.placeholders)) o.placeholders.forEach((p, i) => placeholder(p, `${at}.placeholders[${i}]`));
    if (Array.isArray(o.decorations)) o.decorations.forEach((d, i) => element(d, `${at}.decorations[${i}]`));
  };

  fields(content, V.contentFields, 'presentation');
  if (isObj(content.size)) {
    fields(content.size, V.sizeFields, 'size');
    if (!V.sizes.some(([w, h]) => (content.size as Obj).width === w && (content.size as Obj).height === h)) found.push(`size: unknown slide size ${JSON.stringify(content.size)}`);
  }
  if (isObj(content.theme)) {
    fields(content.theme, V.themeFields, 'theme');
    fields(content.theme.colors, V.themeColorSlots, 'theme.colors');
    fields(content.theme.fonts, V.fontFields, 'theme.fonts');
  }
  if (Array.isArray(content.masters))
    content.masters.forEach((m, i) => {
      if (!isObj(m)) return;
      fields(m, V.masterFields, `masters[${i}]`);
      decorated(m, `masters[${i}]`);
    });
  if (Array.isArray(content.layouts))
    content.layouts.forEach((l, i) => {
      if (!isObj(l)) return;
      fields(l, V.layoutFields, `layouts[${i}]`);
      value(l.kind, V.layoutKinds, `layouts[${i}].kind`);
      decorated(l, `layouts[${i}]`);
    });
  if (Array.isArray(content.slides))
    content.slides.forEach((s, i) => {
      if (!isObj(s)) return;
      const at = `slides[${i}]`;
      fields(s, V.slideFields, at);
      if (s.background !== undefined) fill(s.background, `${at}.background`);
      if (Array.isArray(s.elements)) s.elements.forEach((e, j) => element(e, `${at}.elements[${j}]`));
      text(s.notes, `${at}.notes`);
      if (isObj(s.transition)) {
        fields(s.transition, V.transitionFields, `${at}.transition`);
        value(s.transition.type, V.transitionTypes, `${at}.transition.type`);
        value(s.transition.direction, V.directions, `${at}.transition.direction`);
        value(s.transition.orientation, V.orientations, `${at}.transition.orientation`);
      }
    });
  return found[0] ?? null;
}

/**
 * The content schema a presentation needs. Every presentation this build can represent is schema 1 (anything else is
 * opened read-only, see safety.ts), so this build always writes 1. A later phase adds 2 for content outside
 * PRESENTATION_V1_VOCABULARY, the way documents and diagrams do.
 */
export function presentationSchemaFor(content: unknown): 1 {
  void content;
  return 1;
}
