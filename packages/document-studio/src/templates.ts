import type { JSONContent } from '@tiptap/core';
import { createEmptyDocument, type DocumentContent } from './types';

const text = (t: string, marks?: JSONContent['marks']): JSONContent => ({ type: 'text', text: t, ...(marks ? { marks } : {}) });
const h = (level: number, t: string): JSONContent => ({ type: 'heading', attrs: { level, textAlign: null }, content: [text(t)] });
// Empty strings are skipped: the schema rejects empty text nodes (they made v0.1.0 Lab reports open blank).
const p = (...parts: Array<string | JSONContent>): JSONContent => ({
  type: 'paragraph',
  content: parts.filter((x) => x !== '').map((x) => (typeof x === 'string' ? text(x) : x)),
});
const center = (node: JSONContent): JSONContent => ({ ...node, attrs: { ...node.attrs, textAlign: 'center' } });
const bold = (t: string) => text(t, [{ type: 'bold' }]);
const italic = (t: string) => text(t, [{ type: 'italic' }]);
const bullets = (...items: string[]): JSONContent => ({ type: 'bulletList', content: items.map((i) => ({ type: 'listItem', content: [p(i)] })) });
const numbered = (...items: string[]): JSONContent => ({ type: 'orderedList', attrs: { start: 1 }, content: items.map((i) => ({ type: 'listItem', content: [p(i)] })) });
const table = (rows: string[][]): JSONContent => ({
  type: 'table',
  content: rows.map((row, r) => ({
    type: 'tableRow',
    content: row.map((cell) => ({ type: r === 0 ? 'tableHeader' : 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [p(cell)] })),
  })),
});
const pageBreak: JSONContent = { type: 'pageBreak' };
const toc: JSONContent = { type: 'tableOfContents' };

function make(content: JSONContent[], overrides: Partial<DocumentContent> = {}): DocumentContent {
  const base = createEmptyDocument();
  return { ...base, ...overrides, doc: { type: 'doc', content } };
}

const coverBlock = (title: string) => [
  center(h(1, title)),
  center(p(bold('Student name: '), '____________________')),
  center(p(bold('Roll number: '), '__________   ', bold('Subject: '), '____________________')),
  center(p(bold('Submitted to: '), '____________________   ', bold('Date: '), '__________')),
];

export interface DocumentTemplate {
  id: string;
  name: string;
  description: string;
  build: () => DocumentContent;
}

export const documentTemplates: DocumentTemplate[] = [
  {
    id: 'blank',
    name: 'Blank document',
    description: 'An empty page with standard A4 margins and page numbers.',
    build: createEmptyDocument,
  },
  {
    id: 'assignment',
    name: 'Assignment',
    description: 'Cover details, question, answer and references — the standard submission layout.',
    build: () =>
      make([
        ...coverBlock('Assignment Title'),
        { type: 'horizontalRule' },
        h(2, 'Question'),
        p(italic('Write or paste the assignment question here.')),
        h(2, 'Answer'),
        p('Begin your answer here. Use headings to separate parts of the question, and add diagrams from Diagram Studio where they help.'),
        h(2, 'Conclusion'),
        p('Summarise the key points of your answer.'),
        h(2, 'References'),
        numbered('Author, A. (Year). Title of the book. Publisher.', 'Author, B. (Year). Title of the article. Journal, volume(issue), pages.'),
      ]),
  },
  {
    id: 'lab-report',
    name: 'Lab report',
    description: 'Aim, apparatus, procedure, observations table, result and conclusion.',
    build: () =>
      make(
        [
          ...coverBlock('Experiment No. __: Title'),
          { type: 'horizontalRule' },
          h(2, 'Aim'),
          p('State the objective of the experiment.'),
          h(2, 'Apparatus required'),
          bullets('Item 1', 'Item 2', 'Item 3'),
          h(2, 'Theory'),
          p('Explain the principle behind the experiment.'),
          h(2, 'Procedure'),
          numbered('First step.', 'Second step.', 'Third step.'),
          h(2, 'Observations'),
          table([
            ['S. No.', 'Reading 1', 'Reading 2', 'Mean'],
            ['1', '', '', ''],
            ['2', '', '', ''],
            ['3', '', '', ''],
          ]),
          h(2, 'Result'),
          p('State the result obtained.'),
          h(2, 'Precautions'),
          bullets('Precaution 1', 'Precaution 2'),
        ],
        { mode: 'simple' },
      ),
  },
  {
    id: 'essay',
    name: 'Essay',
    description: 'Title, introduction, body sections and conclusion with comfortable spacing.',
    build: () =>
      make([
        center(h(1, 'Essay Title')),
        center(p(italic('Your name · Course · Date'))),
        h(2, 'Introduction'),
        p('Introduce the topic and state your thesis.'),
        h(2, 'Main argument'),
        p('Develop your first point with evidence.'),
        h(2, 'Counter-argument'),
        p('Address an opposing view.'),
        h(2, 'Conclusion'),
        p('Restate the thesis and summarise.'),
      ]),
  },
  {
    id: 'project-report',
    name: 'Project report',
    description: 'Advanced mode: title page, table of contents, chapters and page breaks.',
    build: () =>
      make(
        [
          ...coverBlock('Project Report Title'),
          pageBreak,
          toc,
          pageBreak,
          h(1, '1. Introduction'),
          p('Background and motivation for the project.'),
          h(2, '1.1 Objectives'),
          bullets('Objective one', 'Objective two'),
          h(1, '2. Literature Review'),
          p('Summarise existing work.'),
          h(1, '3. Methodology'),
          p('Describe your approach.'),
          h(1, '4. Results and Discussion'),
          p('Present and interpret your results.'),
          h(1, '5. Conclusion'),
          p('Summarise findings and future work.'),
          h(1, 'References'),
          numbered('Reference one.', 'Reference two.'),
        ],
        { mode: 'advanced', page: { ...createEmptyDocument().page, header: 'Project Report', footer: '' } },
      ),
  },
];
