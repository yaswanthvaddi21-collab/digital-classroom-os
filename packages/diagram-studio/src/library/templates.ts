import { schemaFor } from '../compat';
import { DEFAULT_CONNECTOR, DEFAULT_SETTINGS, shapeDefaults, type ConnectorData, type DiagramContent, type EdgeLineType, type SerializedEdge, type SerializedNode, type ShapeData, type ShapeKind } from '../types';
import { layoutMindmap } from './mindmap';
import { layoutTimeline } from './timeline';

/*
 * Templates for the shape library's categories (G-SHAPES). Kept apart from templates.ts (which lists them) so they
 * can use the library's layouts; they have their own small helpers, not templates.ts's, to avoid an import cycle.
 */

type Opts = Partial<ShapeData> & { w?: number; h?: number; parent?: string };

function n(id: string, shape: ShapeKind, label: string, x: number, y: number, opts: Opts = {}): SerializedNode {
  const { width, height, ...defaults } = shapeDefaults(shape);
  const { w, h, parent, ...data } = opts;
  return { id, position: { x, y }, width: w ?? width, height: h ?? height, data: { ...defaults, label, ...data }, ...(parent ? { parentId: parent } : {}) };
}

function e(source: string, target: string, opts: { label?: string; sh?: string; th?: string; type?: EdgeLineType; data?: Partial<ConnectorData>; id?: string } = {}): SerializedEdge {
  return {
    id: opts.id ?? `e-${source}-${target}`,
    source,
    target,
    sourceHandle: opts.sh ?? 'r',
    targetHandle: opts.th ?? 'l',
    type: opts.type ?? 'smoothstep',
    label: opts.label ?? '',
    data: { ...DEFAULT_CONNECTOR, ...opts.data },
  };
}

function make(nodes: SerializedNode[], edges: SerializedEdge[]): DiagramContent {
  const content: DiagramContent = { schemaVersion: 2, nodes, edges, viewport: null, settings: { ...DEFAULT_SETTINGS } };
  content.schemaVersion = schemaFor(content);
  return content;
}

const NO_ARROW: Partial<ConnectorData> = { arrow: 'none', startMarker: 'none', endMarker: 'none' };
const OPEN: Partial<ConnectorData> = { startMarker: 'none', endMarker: 'open-arrow' };

/** Mind map with branches all around the central idea (schema 2: only existing shapes and curved connectors). */
export function radialMindmap(): DiagramContent {
  const branches: Array<[string, string[]]> = [
    ['Causes', ['Greenhouse gases', 'Deforestation']],
    ['Effects', ['Rising seas', 'Heatwaves', 'Crop failure']],
    ['Solutions', ['Renewable energy', 'Planting trees']],
    ['What I can do', ['Save energy', 'Reduce waste']],
  ];
  const colours = [
    { fill: '#e0e7ff', stroke: '#4f46e5' },
    { fill: '#fce7f3', stroke: '#be185d' },
    { fill: '#dcfce7', stroke: '#15803d' },
    { fill: '#fef3c7', stroke: '#b45309' },
  ];
  const nodes: SerializedNode[] = [n('root', 'ellipse', 'Climate change', 0, 0, { fill: '#4f46e5', stroke: '#4338ca', textColor: '#ffffff', bold: true, fontSize: 16, w: 180, h: 80 })];
  const edges: SerializedEdge[] = [];
  branches.forEach(([topic, leaves], i) => {
    const id = `b${i + 1}`;
    nodes.push(n(id, 'rounded', topic, 0, 0, { ...colours[i], bold: true, w: 140, h: 50 }));
    edges.push(e('root', id, { type: 'default', data: { ...NO_ARROW, color: colours[i].stroke } }));
    leaves.forEach((leaf, j) => {
      const lid = `${id}-${j + 1}`;
      nodes.push(n(lid, 'rounded', leaf, 0, 0, { fill: '#ffffff', stroke: colours[i].stroke, strokeWidth: 1.5, fontSize: 13, w: 130, h: 44 }));
      edges.push(e(id, lid, { type: 'default', data: { ...NO_ARROW, color: colours[i].stroke, width: 1.5 } }));
    });
  });
  const laid = layoutMindmap(nodes, edges, 'root', 'radial');
  return make(laid.nodes, laid.edges);
}

/** A BPMN process in one pool with two lanes; every step sits inside its lane. */
export function bpmnProcess(): DiagramContent {
  const lane = { w: 1130, h: 220 };
  const nodes = [
    n('pool', 'bpmnPool', 'Assignment submission', 0, 0, { w: lane.w + 30, h: lane.h * 2 }),
    n('student', 'bpmnLane', 'Student', 30, 0, { ...lane, parent: 'pool' }),
    n('teacher', 'bpmnLane', 'Teacher', 30, lane.h, { ...lane, parent: 'pool' }),
    n('start', 'bpmnStart', 'Assignment set', 50, 85, { parent: 'student' }),
    n('write', 'bpmnTask', 'Write assignment', 150, 70, { parent: 'student' }),
    n('submit', 'bpmnTask', 'Submit online', 340, 70, { parent: 'student' }),
    n('resubmit', 'bpmnIntermediate', 'Changes requested', 640, 85, { parent: 'student' }),
    n('store', 'bpmnDataStore', 'Gradebook', 380, 62, { parent: 'teacher' }),
    n('mark', 'bpmnSubprocess', 'Mark assignment', 510, 45, { parent: 'teacher' }),
    n('pass', 'bpmnExclusive', 'Pass?', 730, 62, { parent: 'teacher' }),
    n('publish', 'bpmnTask', 'Publish grade', 850, 50, { parent: 'teacher' }),
    n('sheet', 'bpmnDataObject', 'Marks sheet', 904, 160, { parent: 'teacher', h: 40, w: 32 }),
    n('end', 'bpmnEnd', 'Graded', 1050, 65, { parent: 'teacher' }),
  ];
  const edges = [
    e('start', 'write'),
    e('write', 'submit'),
    e('submit', 'mark', { sh: 'b', th: 't' }),
    e('mark', 'pass'),
    e('pass', 'publish', { label: 'Yes' }),
    e('publish', 'end'),
    e('pass', 'resubmit', { sh: 't', th: 'r', label: 'No' }),
    e('resubmit', 'write', { sh: 't', th: 't' }),
    e('mark', 'store', { sh: 'l', th: 'r', type: 'straight', data: { ...NO_ARROW, dashed: true } }),
    e('publish', 'sheet', { sh: 'b', th: 't', type: 'straight', data: { ...NO_ARROW, dashed: true } }),
  ];
  return make(nodes, edges);
}

/** A UML sequence diagram: lifelines, activation bars and synchronous and return messages. */
export function umlSequence(): DiagramContent {
  const lifelines = [':Student', ':Browser', ':Server', ':Database'];
  const messages: Array<[from: number, to: number, label: string, kind: 'call' | 'return']> = [
    [0, 1, 'submitAssignment()', 'call'],
    [1, 2, 'POST /submissions', 'call'],
    [2, 3, 'INSERT submission', 'call'],
    [3, 2, 'id', 'return'],
    [2, 1, '201 Created', 'return'],
    [1, 0, 'show receipt', 'return'],
  ];
  const step = 50;
  const top = 100;
  const nodes: SerializedNode[] = lifelines.map((label, i) => n(`life${i}`, 'umlLifeline', label, i * 220, 0, { h: top + step * messages.length + 60 }));
  const edges: SerializedEdge[] = [];
  // Each message end has its own activation box centred on the message (connectors attach at a box's middle);
  // the boxes on one lifeline touch, so they read as one activation bar.
  const ends = new Map<number, number[]>();
  messages.forEach(([from, to], k) => {
    for (const who of [from, to]) ends.set(who, [...(ends.get(who) ?? []), top + k * step]);
  });
  const boxAt = new Map<string, string>();
  for (const [who, ys] of ends) {
    const cx = who * 220 + 65 - 8;
    let prevBottom: number | null = null;
    ys.forEach((y, j) => {
      if (prevBottom !== null && y - step / 2 > prevBottom) {
        nodes.push(n(`act${who}-gap${j}`, 'umlActivation', '', cx, prevBottom, { h: y - step / 2 - prevBottom }));
      }
      const id = `act${who}-${j}`;
      nodes.push(n(id, 'umlActivation', '', cx, y - step / 2, { h: step }));
      boxAt.set(`${who}@${y}`, id);
      prevBottom = y + step / 2;
    });
  }
  messages.forEach(([from, to, label, kind], k) => {
    const y = top + k * step;
    const rightward = to > from;
    edges.push(
      e(boxAt.get(`${from}@${y}`)!, boxAt.get(`${to}@${y}`)!, {
        id: `msg${k + 1}`,
        label,
        type: 'straight',
        sh: rightward ? 'r' : 'l',
        th: rightward ? 'l' : 'r',
        data: kind === 'call' ? { startMarker: 'none', endMarker: 'arrow' } : { dashed: true, ...OPEN },
      }),
    );
  });
  return make(nodes, edges);
}

/** A UML activity diagram: initial node, actions, a decision, a fork and join, and the final node. */
export function umlActivity(): DiagramContent {
  const nodes = [
    n('initial', 'umlInitial', '', 185, 0),
    n('open', 'rounded', 'Open the portal', 120, 70, { w: 160, h: 56 }),
    n('enter', 'rounded', 'Enter roll number', 120, 166, { w: 160, h: 56 }),
    n('valid', 'diamond', 'Valid?', 145, 262, { w: 110, h: 80 }),
    n('fork', 'umlFork', '', 60, 392, { w: 280 }),
    n('timetable', 'rounded', 'Show timetable', 10, 442, { w: 160, h: 56 }),
    n('marks', 'rounded', 'Show marks', 230, 442, { w: 160, h: 56 }),
    n('join', 'umlFork', '', 60, 548, { w: 280 }),
    n('logout', 'rounded', 'Log out', 120, 598, { w: 160, h: 56 }),
    n('final', 'umlFinal', '', 183, 694),
  ];
  const down = (a: string, b: string, label = '') => e(a, b, { sh: 'b', th: 't', label, data: OPEN });
  const edges = [
    down('initial', 'open'),
    down('open', 'enter'),
    down('enter', 'valid'),
    down('valid', 'fork', '[yes]'),
    e('valid', 'enter', { sh: 'r', th: 'r', label: '[no]', data: OPEN }),
    down('fork', 'timetable'),
    down('fork', 'marks'),
    down('timetable', 'join'),
    down('marks', 'join'),
    down('join', 'logout'),
    down('logout', 'final'),
  ];
  return make(nodes, edges);
}

/** A UML state machine: an assignment from draft to graded. */
export function umlState(): DiagramContent {
  const st = { w: 140, h: 60, fill: '#f0f9ff', stroke: '#0369a1' };
  const nodes = [
    n('initial', 'umlInitial', '', 0, 95),
    n('draft', 'rounded', 'Draft', 80, 80, st),
    n('submitted', 'rounded', 'Submitted', 340, 80, st),
    n('review', 'rounded', 'Under review', 600, 80, st),
    n('graded', 'rounded', 'Graded', 860, 80, st),
    n('final', 'umlFinal', '', 1080, 93),
  ];
  const edges = [
    e('initial', 'draft', { data: OPEN }),
    e('draft', 'submitted', { label: 'submit', data: OPEN }),
    e('submitted', 'review', { label: 'teacher opens', data: OPEN }),
    e('review', 'graded', { label: 'marks entered', data: OPEN }),
    e('graded', 'final', { data: OPEN }),
    e('review', 'draft', { sh: 'b', th: 'b', label: 'returned for changes', data: OPEN }),
  ];
  return make(nodes, edges);
}

/** A UML use case diagram: actors outside a system boundary that holds the use cases. */
export function umlUseCase(): DiagramContent {
  const uc = { w: 180, h: 70, fill: '#fefce8', stroke: '#a16207' };
  const nodes = [
    n('system', 'umlBoundary', 'Library system', 220, 0, { w: 380, h: 450 }),
    n('search', 'ellipse', 'Search catalogue', 100, 50, { ...uc, parent: 'system' }),
    n('borrow', 'ellipse', 'Borrow book', 100, 145, { ...uc, parent: 'system' }),
    n('return', 'ellipse', 'Return book', 100, 240, { ...uc, parent: 'system' }),
    n('fine', 'ellipse', 'Pay fine', 100, 355, { ...uc, parent: 'system' }),
    n('student', 'actor', 'Student', 40, 165),
    n('librarian', 'actor', 'Librarian', 710, 165),
  ];
  const assoc = { type: 'straight' as const, data: NO_ARROW };
  const edges = [
    e('student', 'search', { ...assoc }),
    e('student', 'borrow', { ...assoc }),
    e('student', 'return', { ...assoc }),
    e('librarian', 'borrow', { ...assoc, sh: 'l', th: 'r' }),
    e('librarian', 'return', { ...assoc, sh: 'l', th: 'r' }),
    e('fine', 'return', { sh: 't', th: 'b', type: 'straight', label: '«extend»', data: { dashed: true, ...OPEN } }),
  ];
  return make(nodes, edges);
}

/** A school network drawn with the network icons (replaces the boxes-and-circles version). */
export function networkDiagram(): DiagramContent {
  const nodes = [
    n('net', 'netCloud', 'Internet', 360, 0),
    n('fw', 'netFirewall', 'Firewall', 360, 140),
    n('router', 'netRouter', 'Router', 360, 280),
    n('switch', 'netSwitch', 'Lab switch', 360, 420),
    n('server', 'netServer', 'File server', 620, 420),
    n('ap', 'netAccessPoint', 'Wi-Fi', 80, 420),
    n('laptop', 'netLaptop', 'Laptop', 0, 580),
    n('phone', 'netMobile', 'Phone', 130, 580),
    n('pc1', 'netDesktop', 'PC 1', 270, 580),
    n('pc2', 'netDesktop', 'PC 2', 390, 580),
    n('pc3', 'netDesktop', 'PC 3', 510, 580),
    n('printer', 'netPrinter', 'Printer', 650, 580),
  ];
  const wire = (a: string, b: string, sh = 'b', th = 't', dashed = false) => e(a, b, { sh, th, type: 'straight', data: { ...NO_ARROW, dashed } });
  const edges = [
    wire('net', 'fw'),
    wire('fw', 'router'),
    wire('router', 'switch'),
    wire('switch', 'server', 'r', 'l'),
    wire('switch', 'ap', 'l', 'r'),
    wire('switch', 'pc1'),
    wire('switch', 'pc2'),
    wire('switch', 'pc3'),
    wire('switch', 'printer'),
    wire('ap', 'laptop', 'b', 't', true),
    wire('ap', 'phone', 'b', 't', true),
  ];
  return make(nodes, edges);
}

/** A timeline: dates on an axis in order, events alternating above and below (Add event keeps the spacing). */
export function timelineDiagram(): DiagramContent {
  const events: Array<[string, string]> = [
    ['1947', 'Independence'],
    ['1950', 'Constitution adopted'],
    ['1969', 'ISRO founded'],
    ['1991', 'Economic reforms'],
    ['2023', 'Chandrayaan-3 lands on the Moon'],
  ];
  const colours = ['#4f46e5', '#0369a1', '#15803d', '#b45309', '#be185d'];
  const nodes: SerializedNode[] = [];
  const edges: SerializedEdge[] = [];
  events.forEach(([year, what], i) => {
    nodes.push(n(`d${i}`, 'timelineDate', year, i * 200, 200, { fill: colours[i], stroke: colours[i] }));
    nodes.push(n(`ev${i}`, 'rounded', what, i * 200, 0, { w: 170, h: 60, stroke: colours[i] }));
    edges.push(e(`d${i}`, `ev${i}`, { sh: 't', th: 'b', type: 'straight', data: { ...NO_ARROW, dashed: true, width: 1.5, color: colours[i] } }));
  });
  const laid = layoutTimeline(nodes, edges, (a, b) => e(a.id, b.id, { type: 'straight', data: { ...NO_ARROW, width: 3 } }));
  return make(laid.nodes, laid.edges);
}

/** Templates in the New diagram dialog for the library's categories, in order. */
export const LIBRARY_TEMPLATES = [
  { id: 'mindmap-radial', name: 'Mind map (radial)', description: 'A central idea with topics all around it, joined by curved branches.', build: radialMindmap },
  { id: 'bpmn', name: 'Business process (BPMN)', description: 'A pool with lanes, events, tasks, a gateway and data, in BPMN notation.', build: bpmnProcess },
  { id: 'uml-sequence', name: 'UML sequence diagram', description: 'Lifelines, activation bars and call and return messages.', build: umlSequence },
  { id: 'uml-activity', name: 'UML activity diagram', description: 'Actions with a decision, a fork and join, from initial to final node.', build: umlActivity },
  { id: 'uml-state', name: 'UML state diagram', description: 'States of an assignment and the events that move it between them.', build: umlState },
  { id: 'uml-usecase', name: 'UML use case diagram', description: 'Actors and the use cases inside a system boundary.', build: umlUseCase },
];

/**
 * Templates that use Phase 5 shapes and are therefore saved as schema 3 (older builds open diagrams made from them
 * read-only). Every other template stays schema 2.
 */
export const SCHEMA3_TEMPLATES: ReadonlySet<string> = new Set(['network', 'timeline', 'bpmn', 'uml-sequence', 'uml-activity', 'uml-state', 'uml-usecase']);

