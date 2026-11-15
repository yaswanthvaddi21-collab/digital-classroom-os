/**
 * The presentation templates (Phase 7 Round 2b, DESIGN): Blank, Lecture, Project presentation, Lab results and Class
 * report. Each starts from the same base (a theme, the built-in master and its eight layouts) and adds a theme of its
 * own, master decorations and example slides with speaker notes, all made of schema-1 content only.
 *
 * Pure and light: create.ts (and through it the `./templates` entry point the app shell imports) uses these builders,
 * so nothing here may import the editor or a heavy library. `createSlide` is passed in to keep create.ts ↔ this file
 * free of an import cycle.
 */
import { layoutIdFor, textStyle } from '../layouts';
import { themeById } from '../themes';
import {
  emptyRichText,
  richTextFromPlain,
  type LayoutKind,
  type PresentationContent,
  type RichTextDoc,
  type ShapeElement,
  type Slide,
  type SlideElement,
  type TableElement,
  type TextElement,
} from '../types';

type MakeId = () => string;
type CreateSlide = (content: Pick<PresentationContent, 'layouts'>, layoutId: string, makeId: MakeId) => Slide;
export type TemplateBuilder = (base: PresentationContent, makeId: MakeId, createSlide: CreateSlide) => PresentationContent;

/** A bulleted list, one item per line. */
export function bullets(lines: string[]): RichTextDoc {
  return {
    type: 'doc',
    content: [{ type: 'bulletList', content: lines.map((line) => ({ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: line }] }] })) }],
  };
}

const asDoc = (t: string | RichTextDoc): RichTextDoc => (typeof t === 'string' ? richTextFromPlain(t) : t);

/** A slide on a built-in layout with its placeholders filled (by placeholder id), extra objects on top, and notes. */
function slide(base: PresentationContent, makeId: MakeId, createSlide: CreateSlide, kind: LayoutKind, texts: Record<string, string | RichTextDoc>, notes = '', extra: SlideElement[] = []): Slide {
  const s = createSlide(base, layoutIdFor(kind), makeId);
  const elements = s.elements.map((e) => (e.type === 'text' && e.placeholderId && texts[e.placeholderId] !== undefined ? { ...e, text: asDoc(texts[e.placeholderId]) } : e));
  return { ...s, elements: [...elements, ...extra], notes: notes ? richTextFromPlain(notes) : emptyRichText() };
}

/** The base with another built-in theme. */
function themed(base: PresentationContent, themeId: string): PresentationContent {
  const theme = themeById(themeId);
  return theme ? { ...base, themeId, theme } : base;
}

const rect = (makeId: MakeId, x: number, y: number, w: number, h: number, name: string): ShapeElement => ({
  id: makeId(),
  type: 'shape',
  name,
  preset: 'rect',
  x,
  y,
  w,
  h,
  rotation: 0,
  fill: { type: 'solid', color: { theme: 'accent1' } },
  line: null,
});

const footerText = (makeId: MakeId, base: PresentationContent, text: string): TextElement => ({
  id: makeId(),
  type: 'text',
  name: 'Footer',
  x: 48,
  y: base.size.height - 38,
  w: 520,
  h: 26,
  rotation: 0,
  text: richTextFromPlain(text),
  style: textStyle({ fontSize: 11, color: { theme: 'dark2' }, autofit: 'none', verticalAlign: 'middle', padding: [2, 10, 2, 10] }),
});

/** A table with a header row and empty data rows, in the theme's colours. */
function table(makeId: MakeId, x: number, y: number, headers: string[], rows: string[][], width: number): TableElement {
  const col = Math.floor(width / headers.length);
  const columns = headers.map((_, i) => (i === headers.length - 1 ? width - col * (headers.length - 1) : col));
  const cell = (t: string) => ({ text: t ? richTextFromPlain(t) : emptyRichText() });
  const rowHeight = 40;
  const all = [headers, ...rows];
  return {
    id: makeId(),
    type: 'table',
    name: 'Results table',
    x,
    y,
    w: width,
    h: rowHeight * all.length,
    rotation: 0,
    columns,
    rows: all.map((r) => ({ height: rowHeight, cells: r.map(cell) })),
    style: {
      headerRow: true,
      bandedRows: true,
      firstColumn: false,
      fill: { theme: 'light1' },
      headerFill: { theme: 'accent1' },
      bandFill: { theme: 'light2' },
      headerTextColor: { theme: 'light1' },
      border: { color: { theme: 'dark2' }, width: 1, dash: 'solid' },
      text: textStyle({ fontSize: 14, autofit: 'none', verticalAlign: 'middle', padding: [4, 8, 4, 8] }),
    },
  };
}

/** Puts decorations on the (only) master of a base. */
function withMasterDecorations(base: PresentationContent, decorations: SlideElement[]): PresentationContent {
  return { ...base, masters: base.masters.map((m, i) => (i === 0 ? { ...m, decorations: [...m.decorations, ...decorations] } : m)) };
}

/** Layouts (by kind) whose slides do not show the master's decorations. */
function hideMasterDecorationsOn(base: PresentationContent, kinds: LayoutKind[]): PresentationContent {
  return { ...base, layouts: base.layouts.map((l) => (kinds.includes(l.kind) ? { ...l, showMasterDecorations: false } : l)) };
}

export const TEMPLATE_BUILDERS: Readonly<Record<string, TemplateBuilder>> = {
  blank: (base, makeId, createSlide) => ({ ...base, slides: [createSlide(base, layoutIdFor('title'), makeId)] }),

  lecture: (b, makeId, createSlide) => {
    let base = themed(b, 'classroom');
    base = withMasterDecorations(base, [rect(makeId, 0, 0, 12, base.size.height, 'Accent bar'), footerText(makeId, base, 'Course name · Lecture 1')]);
    const s = (kind: LayoutKind, texts: Record<string, string | RichTextDoc>, notes?: string) => slide(base, makeId, createSlide, kind, texts, notes);
    return {
      ...base,
      slides: [
        s('title', { title: 'Lecture title', subtitle: 'Course name · Week 1 · Your name' }, 'Welcome the class and say what today is about.'),
        s('titleContent', { title: 'Learning objectives', body: bullets(['Explain the key idea of today’s topic', 'Apply it to a worked example', 'Connect it to last week’s lecture']) }, 'Read the objectives aloud; come back to them at the end.'),
        s('sectionHeader', { title: 'Key concept', body: 'A short sentence that frames this part' }),
        s('twoContent', { title: 'Worked example', left: bullets(['Problem', 'Given values', 'What we want to find']), right: bullets(['Step 1', 'Step 2', 'Answer']) }, 'Work through the example step by step.'),
        s('titleContent', { title: 'Summary', body: bullets(['Main point one', 'Main point two', 'Reading for next week']) }),
        s('title', { title: 'Questions?', subtitle: 'Office hours · contact details' }),
      ],
    };
  },

  project: (b, makeId, createSlide) => {
    let base = themed(b, 'sunrise');
    base = withMasterDecorations(base, [rect(makeId, 0, base.size.height - 10, base.size.width, 10, 'Accent band')]);
    const s = (kind: LayoutKind, texts: Record<string, string | RichTextDoc>, notes?: string) => slide(base, makeId, createSlide, kind, texts, notes);
    return {
      ...base,
      slides: [
        s('title', { title: 'Project name', subtitle: 'Team members · Course · Date' }, 'Introduce the team and the project in one sentence.'),
        s('titleContent', { title: 'The problem', body: bullets(['Who has the problem', 'Why it matters', 'What happens today']) }),
        s('twoContent', { title: 'Our approach', left: bullets(['Idea', 'Method', 'Tools']), right: bullets(['Why this works', 'Risks', 'What we will measure']) }),
        s('titleContent', { title: 'Timeline', body: bullets(['Week 1–2: research', 'Week 3–5: build', 'Week 6: test and present']) }),
        s('comparison', { title: 'Results so far', leftHeading: 'What worked', left: bullets(['…']), rightHeading: 'What we learned', right: bullets(['…']) }),
        s('titleContent', { title: 'Next steps', body: bullets(['Next milestone', 'Help we need', 'Questions for the audience']) }, 'End by asking for feedback.'),
      ],
    };
  },

  'lab-results': (b, makeId, createSlide) => {
    const base = themed(b, 'midnight');
    const s = (kind: LayoutKind, texts: Record<string, string | RichTextDoc>, notes?: string, extra: SlideElement[] = []) => slide(base, makeId, createSlide, kind, texts, notes, extra);
    const { width: W, height: H } = base.size;
    return {
      ...base,
      slides: [
        s('title', { title: 'Experiment title', subtitle: 'Lab group · Course · Date' }),
        s('titleContent', { title: 'Aim and hypothesis', body: bullets(['Aim: what the experiment tests', 'Hypothesis: what we expected to happen']) }),
        s('titleContent', { title: 'Method', body: bullets(['Equipment', 'Procedure in short steps', 'Variables kept the same']) }),
        s('titleOnly', { title: 'Results' }, 'Fill the table with your measurements.', [
          table(makeId, 48, Math.round(H * 0.25), ['Trial', 'Independent variable', 'Measurement', 'Notes'], [['1', '', '', ''], ['2', '', '', ''], ['3', '', '', '']], W - 96),
        ]),
        s('titleContent', { title: 'Analysis', body: bullets(['Trend in the results', 'Sources of error', 'Was the hypothesis supported?']) }),
        s('titleContent', { title: 'Conclusion', body: 'One or two sentences that answer the aim.' }),
      ],
    };
  },

  'class-report': (b, makeId, createSlide) => {
    let base = themed(b, 'paper');
    const titleBottom = 28 + Math.round(base.size.height * 0.15);
    const rule: ShapeElement = { id: makeId(), type: 'shape', name: 'Title rule', preset: 'line', x: 48, y: titleBottom + 6, w: base.size.width - 96, h: 0, rotation: 0, fill: { type: 'none' }, line: { color: { theme: 'accent1' }, width: 2, dash: 'solid' } };
    base = hideMasterDecorationsOn(withMasterDecorations(base, [rule]), ['title', 'sectionHeader', 'blank', 'pictureCaption']);
    const s = (kind: LayoutKind, texts: Record<string, string | RichTextDoc>, notes?: string) => slide(base, makeId, createSlide, kind, texts, notes);
    return {
      ...base,
      slides: [
        s('title', { title: 'Report title', subtitle: 'Your name · Class · Date' }),
        s('titleContent', { title: 'Introduction', body: 'What the report is about and why it matters.' }),
        s('titleContent', { title: 'Background', body: bullets(['What is already known', 'Key terms']) }),
        s('comparison', { title: 'Findings', leftHeading: 'Evidence', left: bullets(['Source 1', 'Source 2']), rightHeading: 'What it shows', right: bullets(['Point 1', 'Point 2']) }),
        s('titleContent', { title: 'Conclusion', body: bullets(['Answer to the question', 'What could be studied next']) }),
        s('titleContent', { title: 'References', body: 'Author, title, year.' }),
      ],
    };
  },
};
