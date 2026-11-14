import { schemaFor } from './compat';
import { layoutTree } from './layout';
import { LIBRARY_TEMPLATES, networkDiagram, timelineDiagram } from './library/templates';
import {
  createEmptyDiagram,
  DEFAULT_CONNECTOR,
  DEFAULT_SETTINGS,
  shapeDefaults,
  type AutoLayout,
  type ConnectorData,
  type DiagramContent,
  type EdgeLineType,
  type SerializedEdge,
  type SerializedNode,
  type ShapeData,
  type ShapeKind,
} from './types';

type NodeOpts = Partial<ShapeData> & { w?: number; h?: number };

function n(id: string, shape: ShapeKind, label: string, x: number, y: number, opts: NodeOpts = {}): SerializedNode {
  const { width, height, ...defaults } = shapeDefaults(shape);
  const { w, h, ...data } = opts;
  return { id, position: { x, y }, width: w ?? width, height: h ?? height, data: { ...defaults, label, ...data } };
}

function e(
  source: string,
  target: string,
  opts: { label?: string; sh?: string; th?: string; type?: EdgeLineType; data?: Partial<ConnectorData> } = {},
): SerializedEdge {
  return {
    id: `e-${source}-${target}`,
    source,
    target,
    sourceHandle: opts.sh ?? 'b',
    targetHandle: opts.th ?? 't',
    type: opts.type ?? 'smoothstep',
    label: opts.label ?? '',
    data: { ...DEFAULT_CONNECTOR, ...opts.data },
  };
}

function make(nodes: SerializedNode[], edges: SerializedEdge[], autoLayout: AutoLayout = 'none'): DiagramContent {
  if (autoLayout !== 'none') {
    const laid = layoutTree(nodes, edges, autoLayout, { siblingGap: 36, levelGap: 70 });
    nodes = laid.nodes;
    edges = laid.edges;
  }
  const content: DiagramContent = { schemaVersion: 2, nodes, edges, viewport: null, settings: { ...DEFAULT_SETTINGS, autoLayout } };
  // A template that uses only schema-2 features stays schema 2, so older builds can still edit diagrams made from it.
  content.schemaVersion = schemaFor(content);
  return content;
}

/** Builds a tree from an outline: [label, children[]] pairs. */
type Outline = [string, Outline[]?];
function tree(outline: Outline, style: (depth: number) => { shape: ShapeKind; opts?: NodeOpts }, direction: 'TB' | 'LR' = 'TB'): DiagramContent {
  const nodes: SerializedNode[] = [];
  const edges: SerializedEdge[] = [];
  let i = 0;
  const walk = ([label, kids = []]: Outline, depth: number, parent?: string) => {
    const id = `n${++i}`;
    const s = style(depth);
    nodes.push(n(id, s.shape, label, 0, 0, s.opts));
    if (parent) edges.push(e(parent, id));
    kids.forEach((k) => walk(k, depth + 1, id));
  };
  walk(outline, 0);
  return make(nodes, edges, direction);
}

const PALETTE = [
  { fill: '#e0e7ff', stroke: '#4f46e5' },
  { fill: '#dcfce7', stroke: '#15803d' },
  { fill: '#fef3c7', stroke: '#b45309' },
  { fill: '#fce7f3', stroke: '#be185d' },
  { fill: '#e0f2fe', stroke: '#0369a1' },
];

export interface DiagramTemplate {
  id: string;
  name: string;
  description: string;
  build: () => DiagramContent;
}

export const diagramTemplates: DiagramTemplate[] = [
  { id: 'blank', name: 'Blank canvas', description: 'An empty grid. Drag shapes in from the left.', build: createEmptyDiagram },
  {
    id: 'flowchart',
    name: 'Flowchart',
    description: 'Start, input, process, decision with yes/no branches, and end.',
    build: () =>
      make(
        [
          n('start', 'ellipse', 'Start', 200, 0),
          n('input', 'parallelogram', 'Read number N', 190, 130),
          n('decide', 'diamond', 'Is N even?', 200, 250),
          n('even', 'rounded', 'Print "Even"', 20, 420),
          n('odd', 'rounded', 'Print "Odd"', 370, 420),
          n('end', 'ellipse', 'End', 200, 560),
        ],
        [
          e('start', 'input'),
          e('input', 'decide'),
          e('decide', 'even', { label: 'Yes', sh: 'l', th: 't' }),
          e('decide', 'odd', { label: 'No', sh: 'r', th: 't' }),
          e('even', 'end', { th: 'l' }),
          e('odd', 'end', { th: 'r' }),
        ],
      ),
  },
  {
    id: 'tree',
    name: 'Tree diagram',
    description: 'A top-down hierarchy. Select a box and press Tab to add a child, Enter for a sibling.',
    build: () =>
      tree(
        ['Root', [['Branch A', [['Leaf A1'], ['Leaf A2']]], ['Branch B', [['Leaf B1'], ['Leaf B2']]], ['Branch C', [['Leaf C1']]]]],
        (d) => ({ shape: 'rounded', opts: { ...PALETTE[d % PALETTE.length], w: 130, h: 56 } }),
      ),
  },
  {
    id: 'mindmap',
    name: 'Mind map',
    description: 'A central idea with branching topics, laid out left to right.',
    build: () =>
      tree(
        ['Photosynthesis', [['Inputs', [['Sunlight'], ['Water'], ['CO₂']]], ['Process', [['Light reactions'], ['Calvin cycle']]], ['Outputs', [['Glucose'], ['Oxygen']]]]],
        (d) =>
          d === 0
            ? { shape: 'ellipse', opts: { fill: '#4f46e5', stroke: '#4338ca', textColor: '#ffffff', bold: true, fontSize: 16, w: 180, h: 80 } }
            : { shape: d === 1 ? 'rounded' : 'rectangle', opts: { ...PALETTE[d % PALETTE.length], w: 140, h: 48, strokeWidth: d === 1 ? 2 : 1 } },
        'LR',
      ),
  },
  {
    id: 'orgchart',
    name: 'Organisation chart',
    description: 'Roles and reporting lines for a department, club or project team.',
    build: () =>
      tree(
        ['Principal', [['HOD Science', [['Physics'], ['Chemistry']]], ['HOD Arts', [['History'], ['English']]], ['Administration', [['Office'], ['Library']]]]],
        (d) => ({ shape: 'rounded', opts: d === 0 ? { fill: '#1e293b', stroke: '#0f172a', textColor: '#ffffff', bold: true, w: 160, h: 60 } : { ...PALETTE[d], w: 140, h: 54 } }),
      ),
  },
  {
    id: 'hierarchy',
    name: 'Hierarchy',
    description: 'Classification levels, such as biological taxonomy or a topic breakdown.',
    build: () =>
      tree(
        ['Vertebrates', [['Mammals', [['Primates'], ['Carnivores']]], ['Birds', [['Raptors']]], ['Reptiles', [['Snakes'], ['Lizards']]]]],
        (d) => ({ shape: 'rectangle', opts: { ...PALETTE[(d + 2) % PALETTE.length], w: 130, h: 50 } }),
      ),
  },
  {
    id: 'process',
    name: 'Process diagram',
    description: 'A left-to-right sequence of stages.',
    build: () => {
      const steps = ['Research', 'Plan', 'Draft', 'Review', 'Submit'];
      return make(
        steps.map((s, i) => n(`s${i}`, 'hexagon', s, i * 210, 0, { ...PALETTE[i % PALETTE.length], w: 160, h: 76 })),
        steps.slice(1).map((_, i) => e(`s${i}`, `s${i + 1}`, { sh: 'r', th: 'l', type: 'straight' })),
      );
    },
  },
  {
    id: 'timeline',
    name: 'Timeline',
    description: 'Events in order along a line, alternating above and below.',
    // schema 3 (G-SHAPES): drawn with the library's timeline dates, so Add event keeps the spacing (library/templates.ts).
    build: timelineDiagram,
  },
  {
    id: 'venn',
    name: 'Venn diagram',
    description: 'Three overlapping sets with labels you can edit.',
    build: () =>
      make(
        [
          n('a', 'circle', '', 0, 0, { fill: '#6366f155', stroke: '#4f46e5', w: 260, h: 260 }),
          n('b', 'circle', '', 160, 0, { fill: '#10b98155', stroke: '#047857', w: 260, h: 260 }),
          n('c', 'circle', '', 80, 140, { fill: '#f59e0b55', stroke: '#b45309', w: 260, h: 260 }),
          n('la', 'text', 'Set A', 30, 80, { bold: true }),
          n('lb', 'text', 'Set B', 240, 80, { bold: true }),
          n('lc', 'text', 'Set C', 130, 320, { bold: true }),
          n('mid', 'text', 'A ∩ B ∩ C', 130, 170, { fontSize: 13, w: 160 }),
        ],
        [],
      ),
  },
  {
    id: 'uml-class',
    name: 'UML class diagram',
    description: 'Classes with attributes and methods, inheritance and composition.',
    build: () =>
      make(
        [
          n('person', 'umlClass', 'Person\n- name: String\n- email: String\n--\n+ getName(): String', 200, 0, { w: 220, h: 130 }),
          n('student', 'umlClass', 'Student\n- rollNo: int\n--\n+ enrol(c: Course): void', 0, 230, { w: 220, h: 120 }),
          n('teacher', 'umlClass', 'Teacher\n- subject: String\n--\n+ grade(s: Student): int', 400, 230, { w: 220, h: 120 }),
          n('course', 'umlClass', 'Course\n- code: String\n- credits: int\n--\n+ addStudent(s: Student)', 0, 460, { w: 220, h: 130 }),
        ],
        [
          e('student', 'person', { sh: 't', th: 'b', type: 'smoothstep', data: { endMarker: 'triangle' } }),
          e('teacher', 'person', { sh: 't', th: 'b', type: 'smoothstep', data: { endMarker: 'triangle' } }),
          e('course', 'student', { label: 'enrols', sh: 't', th: 'b', type: 'straight', data: { startMarker: 'diamond', endMarker: 'open-arrow' } }),
        ],
      ),
  },
  {
    id: 'er',
    name: 'ER diagram',
    description: 'Database entities with keys and crow’s-foot relationships.',
    build: () =>
      make(
        [
          n('students', 'erEntity', 'STUDENT\nPK student_id\nname\nemail', 0, 0),
          n('enrolments', 'erEntity', 'ENROLMENT\nPK enrolment_id\nFK student_id\nFK course_id\ngrade', 300, 0, { h: 140 }),
          n('courses', 'erEntity', 'COURSE\nPK course_id\ntitle\ncredits', 600, 0),
        ],
        [
          e('students', 'enrolments', { sh: 'r', th: 'l', type: 'straight', label: 'has', data: { arrow: 'none', startMarker: 'crow-one', endMarker: 'crow-zero-many' } }),
          e('courses', 'enrolments', { sh: 'l', th: 'r', type: 'straight', label: 'has', data: { arrow: 'none', startMarker: 'crow-one', endMarker: 'crow-zero-many' } }),
        ],
      ),
  },
  {
    id: 'network',
    name: 'Network diagram',
    description: 'Devices connected to a router and a server, e.g. a computer lab.',
    // schema 3 (G-SHAPES): drawn with the library's network icons (library/templates.ts).
    build: networkDiagram,
  },
  // schema 2 and 3 (G-SHAPES): radial mind map, BPMN, UML sequence/activity/state/use case (library/templates.ts).
  ...LIBRARY_TEMPLATES,
  // @phase5:templates — new templates (the helpers below are exported for templates kept in their own files).
];

export { e as templateEdge, make as makeTemplate, n as templateNode, PALETTE as TEMPLATE_PALETTE, tree as treeTemplate, type NodeOpts as TemplateNodeOpts, type Outline as TemplateOutline };
