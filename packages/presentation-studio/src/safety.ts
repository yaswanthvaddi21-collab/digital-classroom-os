import { presentationNovelty } from './compat';
import { createLayouts, createMaster } from './layouts';
import { migratePresentation } from './migrate';
import { DEFAULT_THEME_ID, isHexColor, themeById } from './themes';
import {
  emptyRichText,
  PRESENTATION_SCHEMA,
  SLIDE_SIZES,
  THEME_COLOR_SLOTS,
  type PresentationContent,
  type PresentationSize,
  type PresentationTheme,
  type RichTextDoc,
  type Slide,
  type SlideElement,
  type SlideLayout,
  type SlideMaster,
} from './types';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isId = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const isBool = (v: unknown) => v === undefined || typeof v === 'boolean';

/** Problems with a colour value, or none. */
function colorProblem(c: unknown): string | null {
  if (isStr(c)) return isHexColor(c) ? null : `colour ${JSON.stringify(c)} is not #rrggbb`;
  if (isObj(c) && isStr(c.theme) && (THEME_COLOR_SLOTS as readonly string[]).includes(c.theme)) return null;
  return 'colour is not readable';
}

function lineProblem(l: unknown): string | null {
  if (l === null || l === undefined) return null;
  if (!isObj(l)) return 'line is not readable';
  return colorProblem(l.color) ?? (isNum(l.width) && l.width >= 0 ? null : 'line width is not a number');
}

function fillProblem(f: unknown): string | null {
  if (!isObj(f)) return 'fill is not readable';
  switch (f.type) {
    case 'none':
      return null;
    case 'solid':
      return colorProblem(f.color) ?? (f.opacity === undefined || (isNum(f.opacity) && f.opacity >= 0 && f.opacity <= 1) ? null : 'fill opacity is out of range');
    case 'gradient':
      if (!isNum(f.angle) || !Array.isArray(f.stops) || f.stops.length < 2) return 'gradient needs an angle and two or more stops';
      for (const s of f.stops) if (!isObj(s) || !isNum(s.position) || colorProblem(s.color)) return 'gradient stop is not readable';
      return null;
    case 'image':
      return isId(f.attachmentId) ? null : 'picture fill has no picture';
    default:
      return `unknown fill ${JSON.stringify(f.type)}`;
  }
}

/** Problems with rich text: Tiptap JSON with text nodes holding text and content held in lists. */
function richTextProblem(doc: unknown): string | null {
  if (!isObj(doc) || doc.type !== 'doc' || !Array.isArray(doc.content)) return 'text is not readable';
  const visit = (n: unknown, depth: number): string | null => {
    if (!isObj(n) || !isStr(n.type)) return 'text holds an unreadable part';
    if (depth > 40) return 'text is nested too deeply';
    if (n.type === 'text') return isStr(n.text) && n.text.length > 0 ? (n.marks === undefined || Array.isArray(n.marks) ? null : 'text marks are not a list') : 'text holds an empty text part';
    if (n.content !== undefined) {
      if (!Array.isArray(n.content)) return 'text holds an unreadable part';
      for (const c of n.content) {
        const p = visit(c, depth + 1);
        if (p) return p;
      }
    }
    return null;
  };
  for (const b of doc.content) {
    const p = visit(b, 1);
    if (p) return p;
  }
  return null;
}

function textStyleProblem(s: unknown): string | null {
  if (!isObj(s)) return 'text style is missing';
  if (!isStr(s.font) || !isNum(s.fontSize) || s.fontSize <= 0) return 'text style has no font or size';
  if (!isNum(s.lineSpacing) || !Array.isArray(s.padding) || s.padding.length !== 4 || !s.padding.every(isNum)) return 'text style spacing is not readable';
  return colorProblem(s.color);
}

/** Problems with one element, or null when it can be shown and edited. */
export function elementProblem(e: unknown): string | null {
  if (!isObj(e)) return 'element is not readable';
  if (!isId(e.id)) return 'element has no id';
  if (![e.x, e.y, e.w, e.h, e.rotation].every(isNum) || (e.w as number) < 0 || (e.h as number) < 0) return `element ${e.id} has no readable position or size`;
  if (!isBool(e.locked) || (e.name !== undefined && !isStr(e.name)) || (e.placeholderId !== undefined && !isId(e.placeholderId))) return `element ${e.id} has unreadable settings`;
  if (e.animation !== undefined && (!isObj(e.animation) || !isNum(e.animation.order) || !isNum(e.animation.duration) || !isStr(e.animation.effect))) return `element ${e.id} has an unreadable animation`;
  const at = (p: string | null) => (p ? `element ${e.id}: ${p}` : null);
  switch (e.type) {
    case 'text':
      return at(richTextProblem(e.text) ?? textStyleProblem(e.style) ?? (e.fill === undefined ? null : fillProblem(e.fill)) ?? lineProblem(e.line));
    case 'image':
      return at(isId(e.attachmentId) && isStr(e.mimeType) && isNum(e.naturalWidth) && isNum(e.naturalHeight) && isStr(e.alt) && isStr(e.fit) ? null : 'picture is incomplete');
    case 'shape':
      return at(
        (isStr(e.preset) ? null : 'shape has no kind') ?? fillProblem(e.fill) ?? lineProblem(e.line) ?? (e.text === undefined ? null : richTextProblem(e.text)) ?? (e.textStyle === undefined ? null : textStyleProblem(e.textStyle)),
      );
    case 'table': {
      if (!Array.isArray(e.columns) || !e.columns.length || !e.columns.every(isNum)) return at('table has no columns');
      if (!Array.isArray(e.rows) || !e.rows.length) return at('table has no rows');
      for (const r of e.rows) {
        if (!isObj(r) || !isNum(r.height) || !Array.isArray(r.cells) || r.cells.length !== e.columns.length) return at('a table row does not match its columns');
        for (const c of r.cells) if (!isObj(c) || richTextProblem(c.text) || (c.fill !== undefined && colorProblem(c.fill))) return at('a table cell is not readable');
      }
      const s = e.style;
      if (!isObj(s) || textStyleProblem(s.text) || lineProblem(s.border) || ['fill', 'headerFill', 'bandFill', 'headerTextColor'].some((k) => colorProblem(s[k]))) return at('table style is not readable');
      return null;
    }
    case 'chart': {
      if (!isStr(e.chartType) || !Array.isArray(e.categories) || !e.categories.every(isStr)) return at('chart has no categories');
      if (!Array.isArray(e.series) || !e.series.every((s) => isObj(s) && isStr(s.name) && Array.isArray(s.values) && s.values.every((v) => v === null || isNum(v)))) return at('chart data is not readable');
      return at(isStr(e.title) && isNum(e.fontSize) && isStr(e.font) && isStr(e.legend) ? colorProblem(e.textColor) : 'chart settings are not readable');
    }
    case 'diagram':
      return at(isStr(e.previewId) && isNum(e.naturalWidth) && isNum(e.naturalHeight) && isStr(e.title) ? null : 'diagram is incomplete');
    default:
      return `unknown element type ${JSON.stringify(e.type)}`;
  }
}

function placeholderProblem(p: unknown): string | null {
  if (!isObj(p) || !isId(p.id) || !isStr(p.kind) || !isStr(p.prompt) || ![p.x, p.y, p.w, p.h].every(isNum)) return 'placeholder is not readable';
  return textStyleProblem(p.style);
}

function decoratedProblem(o: Obj, what: string): string | null {
  if (o.background !== undefined) {
    const p = fillProblem(o.background);
    if (p || (o.background as Obj).type === 'none') return `${what} background: ${p ?? 'none is not a background'}`;
  }
  if (!Array.isArray(o.placeholders) || !Array.isArray(o.decorations)) return `${what} is incomplete`;
  const ids = new Set<string>();
  for (const p of o.placeholders) {
    const problem = placeholderProblem(p);
    if (problem) return `${what}: ${problem}`;
    if (ids.has((p as Obj).id as string)) return `${what}: two placeholders share an id`;
    ids.add((p as Obj).id as string);
  }
  for (const d of o.decorations) {
    const problem = elementProblem(d);
    if (problem) return `${what}: ${problem}`;
  }
  return null;
}

function themeProblem(t: unknown): string | null {
  if (!isObj(t) || !isStr(t.id) || !isStr(t.name) || !isObj(t.colors) || !isObj(t.fonts)) return 'the theme is not readable';
  for (const slot of THEME_COLOR_SLOTS) if (!isHexColor(t.colors[slot])) return `the theme colour ${slot} is not readable`;
  return isStr(t.fonts.heading) && isStr(t.fonts.body) ? null : 'the theme fonts are not readable';
}

/**
 * Everything that keeps `content` from being shown and edited exactly, in plain words. Empty when it is a well-formed
 * schema-1 presentation that uses only the schema-1 vocabulary.
 */
export function presentationProblems(content: unknown): string[] {
  if (!isObj(content)) return ['the content is not a presentation'];
  const problems: string[] = [];
  const add = (p: string | null) => p && problems.push(p);
  if (content.schemaVersion !== PRESENTATION_SCHEMA) add(`content version ${JSON.stringify(content.schemaVersion)} is not ${PRESENTATION_SCHEMA}`);
  if (!isObj(content.size) || !Object.values(SLIDE_SIZES).some((s) => s.width === (content.size as Obj).width && s.height === (content.size as Obj).height)) add('the slide size is not readable');
  if (!isStr(content.themeId)) add('the theme id is missing');
  add(themeProblem(content.theme));
  const masters = Array.isArray(content.masters) ? content.masters : null;
  const layouts = Array.isArray(content.layouts) ? content.layouts : null;
  const slides = Array.isArray(content.slides) ? content.slides : null;
  if (!masters?.length) add('there is no slide master');
  if (!layouts?.length) add('there are no slide layouts');
  if (!slides) add('there is no list of slides');
  const masterIds = new Set<string>();
  for (const m of masters ?? []) {
    if (!isObj(m) || !isId(m.id) || !isStr(m.name) || m.background === undefined) add('a slide master is not readable');
    else if (masterIds.has(m.id)) add('two slide masters share an id');
    else {
      masterIds.add(m.id);
      add(decoratedProblem(m, `master “${m.name}”`));
    }
  }
  const layoutIds = new Set<string>();
  for (const l of layouts ?? []) {
    if (!isObj(l) || !isId(l.id) || !isStr(l.name) || !isStr(l.kind) || typeof l.showMasterDecorations !== 'boolean') add('a slide layout is not readable');
    else if (layoutIds.has(l.id)) add('two slide layouts share an id');
    else if (!isStr(l.masterId) || !masterIds.has(l.masterId)) add(`layout “${l.name}” has no master`);
    else {
      layoutIds.add(l.id);
      add(decoratedProblem(l, `layout “${l.name}”`));
    }
  }
  const slideIds = new Set<string>();
  (slides ?? []).forEach((s, i) => {
    const where = `slide ${i + 1}`;
    if (!isObj(s) || !isId(s.id)) return void add(`${where} is not readable`);
    if (slideIds.has(s.id)) add(`${where} has the same id as another slide`);
    slideIds.add(s.id);
    if (!isStr(s.layoutId) || !layoutIds.has(s.layoutId)) add(`${where} has no layout`);
    if (s.background !== undefined && (fillProblem(s.background) || (s.background as Obj).type === 'none')) add(`${where} has an unreadable background`);
    if (!Array.isArray(s.elements)) return void add(`${where} has no list of objects`);
    const ids = new Set<string>();
    for (const e of s.elements) {
      const p = elementProblem(e);
      if (p) add(`${where}: ${p}`);
      else if (ids.has((e as Obj).id as string)) add(`${where}: two objects share an id`);
      else ids.add((e as Obj).id as string);
    }
    const notes = richTextProblem(s.notes);
    if (notes) add(`${where} notes: ${notes}`);
    if (s.transition !== undefined && (!isObj(s.transition) || !isStr(s.transition.type) || !isNum(s.transition.duration))) add(`${where} has an unreadable transition`);
    if (!isBool(s.hidden)) add(`${where} has an unreadable hidden setting`);
  });
  if (!problems.length) add(presentationNovelty(content));
  return problems;
}

export type PreparedPresentation =
  | { state: 'editable'; content: PresentationContent; repairs: string[] }
  | { state: 'protected'; reason: 'newer' | 'invalid'; detail: string; display: PresentationContent };

/**
 * Decides how a stored presentation may be opened. Anything this build cannot represent exactly (content from a newer
 * version, or content that is damaged or uses something unknown) is opened in a protected read-only view built from a
 * display copy. The stored original is never changed: `raw` is only read.
 */
export function preparePresentation(raw: unknown): PreparedPresentation {
  const migrated = migratePresentation(raw);
  if (!migrated.ok && migrated.reason === 'newer') {
    return { state: 'protected', reason: 'newer', detail: `This presentation was saved by a newer version of Classroom OS (content version ${migrated.version}).`, display: displaySafe(raw) };
  }
  if (!migrated.ok) {
    return { state: 'protected', reason: 'invalid', detail: `This version cannot show this presentation exactly: its content version ${typeof migrated.stored === 'string' ? JSON.stringify(migrated.stored) : typeof migrated.stored === 'object' && migrated.stored !== null ? 'a ' + (Array.isArray(migrated.stored) ? 'list' : 'record') : String(migrated.stored)} is not readable.`, display: displaySafe(raw) };
  }
  const problems = isObj(raw) ? presentationProblems(migrated.content) : presentationProblems(raw);
  if (!problems.length) return { state: 'editable', content: migrated.content, repairs: migrated.repairs };
  return { state: 'protected', reason: 'invalid', detail: `This version cannot show this presentation exactly: ${problems.slice(0, 3).join('; ')}.`, display: displaySafe(raw) };
}

/**
 * A best-effort copy for viewing only, built from a deep copy of `raw`: whatever is readable is kept (slides, their
 * readable objects, notes, backgrounds, theme, layouts); the rest falls back to the built-in defaults.
 */
export function displaySafe(raw: unknown): PresentationContent {
  const src: Obj = isObj(raw) ? structuredClone(raw) : {};
  const size: PresentationSize = isObj(src.size) && src.size.height === 720 && src.size.width === 960 ? { ...SLIDE_SIZES['4:3'] } : { ...SLIDE_SIZES['16:9'] };
  const theme: PresentationTheme = themeProblem(src.theme) ? themeById(DEFAULT_THEME_ID)! : (src.theme as PresentationTheme);
  const masters = (Array.isArray(src.masters) ? src.masters : []).filter(
    (m): m is SlideMaster => isObj(m) && isId(m.id) && isStr(m.name) && m.background !== undefined && !decoratedProblem(m, 'master'),
  );
  if (!masters.length) masters.push(createMaster(size));
  const masterIds = new Set(masters.map((m) => m.id));
  let layouts = (Array.isArray(src.layouts) ? src.layouts : []).filter(
    (l): l is SlideLayout => isObj(l) && isId(l.id) && isStr(l.name) && isStr(l.kind) && isStr(l.masterId) && masterIds.has(l.masterId) && !decoratedProblem(l, 'layout'),
  );
  if (!layouts.length) layouts = createLayouts(size).map((l) => ({ ...l, masterId: masters[0].id }));
  const layoutIds = new Set(layouts.map((l) => l.id));
  const slides: Slide[] = (Array.isArray(src.slides) ? src.slides : []).filter(isObj).map((s, i) => ({
    id: isId(s.id) ? s.id : `slide-${i + 1}`,
    layoutId: isStr(s.layoutId) && layoutIds.has(s.layoutId) ? s.layoutId : layouts[0].id,
    ...(s.background !== undefined && !fillProblem(s.background) && (s.background as Obj).type !== 'none' ? { background: s.background as Slide['background'] } : {}),
    elements: (Array.isArray(s.elements) ? s.elements : []).filter((e): e is SlideElement => !elementProblem(e)),
    notes: richTextProblem(s.notes) ? emptyRichText() : (s.notes as RichTextDoc),
    ...(s.hidden === true ? { hidden: true } : {}),
  }));
  return { schemaVersion: PRESENTATION_SCHEMA, size, themeId: isStr(src.themeId) ? src.themeId : DEFAULT_THEME_ID, theme, masters, layouts, slides };
}
