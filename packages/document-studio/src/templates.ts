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
  // Phase 4 (G-FILES). Like the templates above, these use only what v0.1.0 could store, so they stay content
  // schema 1 and open in v0.1.0 too. (Double line spacing and hanging indents arrive with paragraph formatting.)
  {
    id: 'research-paper',
    name: 'Research paper (APA style)',
    description: 'Title page, abstract, APA-style headings (Method, Results, Discussion) and a references list.',
    build: () =>
      make(
        [
          p(),
          p(),
          center(p(bold('Title of the Research Paper: Capitalise Major Words'))),
          p(),
          center(p('Author Name')),
          center(p('Department, University Name')),
          center(p('Course Number: Course Name')),
          center(p('Instructor Name')),
          center(p('Due Date')),
          pageBreak,
          center(h(1, 'Abstract')),
          p('Summarise the study in 150–250 words: the problem, the participants, the method, the main results and what they mean.'),
          p(italic('Keywords: '), 'keyword one, keyword two, keyword three'),
          pageBreak,
          center(h(1, 'Title of the Research Paper')),
          p('Introduce the problem, review the research it builds on, and state the purpose and hypotheses of the study. In APA style the introduction is headed by the paper’s title, not by “Introduction”.'),
          h(2, 'Background'),
          p('Explain the theory and earlier findings, citing sources in the text (Author, Year).'),
          center(h(1, 'Method')),
          h(2, 'Participants'),
          p('Describe who took part, how many, and how they were selected.'),
          h(2, 'Materials'),
          p('Describe the instruments, questionnaires or equipment used.'),
          h(2, 'Procedure'),
          p('Describe step by step what was done.'),
          h(3, 'Data Analysis'),
          p('Describe how the data were analysed.'),
          center(h(1, 'Results')),
          p('Report the findings without interpreting them. Use tables and figures where they help.'),
          table([
            ['Measure', 'Group A', 'Group B'],
            ['Mean', '0.00', '0.00'],
            ['SD', '0.00', '0.00'],
          ]),
          center(h(1, 'Discussion')),
          p('Interpret the results, relate them to the hypotheses and to earlier research, note limitations and suggest future work.'),
          pageBreak,
          center(h(1, 'References')),
          p('Author, A. A., & Author, B. B. (Year). Title of the article. ', italic('Journal Name, volume'), '(issue), pages. https://doi.org/xxxx'),
          p('Author, C. C. (Year). ', italic('Title of the book'), '. Publisher.'),
          p('Organisation Name. (Year, Month Day). ', italic('Title of the web page'), '. Site Name. URL'),
        ],
        { mode: 'advanced' },
      ),
  },
  {
    id: 'mla-essay',
    name: 'MLA essay',
    description: 'MLA heading (name, instructor, course, date), centred title, body and a Works Cited page.',
    build: () =>
      make(
        [
          p('Your Name'),
          p('Instructor Name'),
          p('Course Name and Number'),
          p('Day Month Year'),
          center(p('Title of the Essay')),
          p('Open with a sentence that draws the reader in, give the background the reader needs, and end the paragraph with your thesis statement.'),
          p('Each body paragraph makes one point that supports the thesis. Introduce evidence and cite it in the text with the author and page number (Author 23).'),
          p('Address a counter-argument, then explain why your position still holds.'),
          p('Conclude by restating the thesis in new words and showing why it matters.'),
          pageBreak,
          center(p('Works Cited')),
          p('Author Last Name, First Name. ', italic('Title of the Book'), '. Publisher, Year.'),
          p('Author Last Name, First Name. “Title of the Article.” ', italic('Name of the Journal'), ', vol. 1, no. 2, Year, pp. 10–20.'),
          p('“Title of the Web Page.” ', italic('Name of the Website'), ', Day Month Year, URL.'),
        ],
        { page: { ...createEmptyDocument().page, header: 'Your Last Name' } },
      ),
  },
  {
    id: 'cover-page',
    name: 'Cover page',
    description: 'A title page with institution, title, student and submission details, then a blank page to write on.',
    build: () =>
      make([
        center(p(bold('Name of the Institution'))),
        center(p('Department of Subject')),
        p(),
        p(),
        p(),
        center(h(1, 'Title of the Work')),
        center(p(italic('Subtitle or type of work (assignment, project, report)'))),
        p(),
        p(),
        {
          type: 'table',
          content: [
            ['Submitted by', 'Student name'],
            ['Roll number', '__________'],
            ['Course', 'Course name and code'],
            ['Submitted to', 'Instructor name'],
            ['Date of submission', '__________'],
          ].map(([label, value]) => ({
            type: 'tableRow',
            content: [
              { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [p(bold(label))] },
              { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [p(value)] },
            ],
          })),
        },
        pageBreak,
        p('Start writing here.'),
      ], { page: { ...createEmptyDocument().page, pageNumbers: false } }),
  },
  {
    id: 'formal-letter',
    name: 'Formal letter',
    description: 'Block-format letter: your address, date, recipient, subject line, body and sign-off.',
    build: () =>
      make(
        [
          p('Your Name'),
          p('Street Address'),
          p('City, Postal Code'),
          p('your.email@example.com · Phone number'),
          p(),
          p('Day Month Year'),
          p(),
          p('Recipient Name'),
          p('Title or Position'),
          p('Organisation Name'),
          p('Street Address'),
          p('City, Postal Code'),
          p(),
          p(bold('Subject: '), 'State the purpose of the letter in a few words'),
          p(),
          p('Dear Recipient Name,'),
          p('State why you are writing in the first paragraph.'),
          p('Give the details, reasons or background in one or two paragraphs. Keep each paragraph to one point.'),
          p('Close by saying what you would like to happen next, and thank the reader for their time.'),
          p('Yours sincerely,'),
          p(),
          p(),
          p('Your Name'),
          p(italic('Enclosures: list any documents you are sending with the letter')),
        ],
        { page: { ...createEmptyDocument().page, pageNumbers: false } },
      ),
  },
];
