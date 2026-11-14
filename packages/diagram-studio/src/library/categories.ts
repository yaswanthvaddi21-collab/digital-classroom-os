import { shapeDef } from '../shapeRegistry';
import type { ShapeKind } from '../types';

/** One shape in the library. `name`/`hint` default to the kind's catalog entry; a category may name it for its use. */
export interface LibraryEntry {
  kind: ShapeKind;
  name?: string;
  hint?: string;
  /** Extra words search should find it by. */
  keywords?: string;
}

export interface ShapeCategory {
  id: string;
  name: string;
  entries: LibraryEntry[];
}

/** The shape library's categories, in panel order. A kind may appear in several (an actor is UML class and use case). */
export const SHAPE_CATEGORIES: ShapeCategory[] = [
  {
    id: 'general',
    name: 'General and flowchart',
    entries: [
      { kind: 'rounded', keywords: 'flowchart step action' },
      { kind: 'rectangle' },
      { kind: 'ellipse', keywords: 'flowchart oval' },
      { kind: 'diamond', keywords: 'flowchart condition if' },
      { kind: 'parallelogram', keywords: 'flowchart' },
      { kind: 'circle' },
      { kind: 'hexagon' },
      { kind: 'cylinder', keywords: 'storage' },
      { kind: 'document' },
      { kind: 'triangle' },
      { kind: 'note', keywords: 'comment' },
      { kind: 'text', keywords: 'label' },
    ],
  },
  {
    id: 'uml-class',
    name: 'UML class and ER',
    entries: [{ kind: 'umlClass' }, { kind: 'erEntity', keywords: 'database table' }, { kind: 'package' }, { kind: 'actor', keywords: 'person user' }],
  },
  {
    id: 'uml-sequence',
    name: 'UML sequence',
    entries: [{ kind: 'actor', keywords: 'person user' }, { kind: 'umlLifeline', keywords: 'object participant' }, { kind: 'umlActivation', keywords: 'execution focus' }, { kind: 'note' }],
  },
  {
    id: 'uml-activity',
    name: 'UML activity and state',
    entries: [
      { kind: 'umlInitial', keywords: 'start' },
      { kind: 'rounded', name: 'Action / state', hint: 'An activity step or a state' },
      { kind: 'diamond', name: 'Decision / merge', hint: 'Branch on a condition, or merge branches' },
      { kind: 'umlFork', keywords: 'parallel synchronisation' },
      { kind: 'umlFinal', keywords: 'end stop' },
      { kind: 'note' },
    ],
  },
  {
    id: 'uml-usecase',
    name: 'UML use case',
    entries: [{ kind: 'actor', keywords: 'person user' }, { kind: 'ellipse', name: 'Use case', hint: 'Something an actor does with the system' }, { kind: 'umlBoundary', keywords: 'container subject' }],
  },
  {
    id: 'bpmn',
    name: 'Business process (BPMN)',
    entries: [
      { kind: 'bpmnPool', keywords: 'swimlane participant container' },
      { kind: 'bpmnLane', keywords: 'swimlane role container' },
      { kind: 'bpmnStart', keywords: 'event begin' },
      { kind: 'bpmnIntermediate', keywords: 'event timer message' },
      { kind: 'bpmnEnd', keywords: 'event finish stop' },
      { kind: 'bpmnTask', keywords: 'activity step' },
      { kind: 'bpmnSubprocess', keywords: 'activity' },
      { kind: 'bpmnExclusive', keywords: 'gateway decision xor' },
      { kind: 'bpmnParallel', keywords: 'gateway fork join and' },
      { kind: 'bpmnInclusive', keywords: 'gateway or' },
      { kind: 'bpmnDataObject', keywords: 'document artifact' },
      { kind: 'bpmnDataStore', keywords: 'database storage' },
    ],
  },
  {
    id: 'network',
    name: 'Network',
    entries: [
      { kind: 'netServer', keywords: 'computer rack' },
      { kind: 'netDesktop', keywords: 'computer pc workstation' },
      { kind: 'netLaptop', keywords: 'computer notebook' },
      { kind: 'netRouter', keywords: 'internet modem' },
      { kind: 'netSwitch', keywords: 'hub lan ethernet' },
      { kind: 'netFirewall', keywords: 'security' },
      { kind: 'netCloud', keywords: 'internet' },
      { kind: 'netDatabase', keywords: 'storage sql' },
      { kind: 'netMobile', keywords: 'smartphone tablet' },
      { kind: 'netPrinter', keywords: 'print' },
      { kind: 'netAccessPoint', keywords: 'wifi wireless wlan' },
    ],
  },
  {
    id: 'mindmap-timeline',
    name: 'Mind map and timeline',
    entries: [
      { kind: 'ellipse', name: 'Central idea', hint: 'The centre of a mind map' },
      { kind: 'rounded', name: 'Topic', hint: 'A branch of a mind map' },
      { kind: 'timelineDate', keywords: 'year history event' },
      { kind: 'rounded', name: 'Event', hint: 'What happened on a date' },
    ],
  },
  {
    id: 'venn',
    name: 'Venn and sets',
    entries: [{ kind: 'circle', name: 'Set', hint: 'A set; overlap circles to show intersections' }, { kind: 'text', name: 'Label', hint: 'Name a set or region' }],
  },
];

/** An entry with its name and hint filled in from the kind's catalog entry. */
export interface ResolvedEntry {
  kind: ShapeKind;
  name: string;
  hint: string;
  category: string;
  keywords: string;
}

export function resolveEntry(entry: LibraryEntry, category: ShapeCategory): ResolvedEntry {
  const catalog = shapeDef(entry.kind)?.catalog;
  return {
    kind: entry.kind,
    name: entry.name ?? catalog?.name ?? entry.kind,
    hint: entry.hint ?? catalog?.hint ?? '',
    category: category.name,
    keywords: entry.keywords ?? '',
  };
}

const normalise = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * Shapes matching a search: every word of the query must start a word of the shape's name, hint, keywords or
 * category. Best matches first (name matches before others), each kind and name once.
 */
export function searchShapes(query: string, categories: ShapeCategory[] = SHAPE_CATEGORIES): ResolvedEntry[] {
  const words = normalise(query).split(' ').filter(Boolean);
  if (!words.length) return [];
  const seen = new Set<string>();
  const scored: Array<{ e: ResolvedEntry; score: number; order: number }> = [];
  let order = 0;
  for (const c of categories)
    for (const entry of c.entries) {
      const e = resolveEntry(entry, c);
      const key = `${e.kind}|${e.name}`;
      if (seen.has(key)) continue;
      const name = normalise(e.name).split(' ');
      const rest = normalise(`${e.hint} ${e.keywords} ${e.category} ${e.kind}`).split(' ');
      const all = [...name, ...rest];
      if (!words.every((w) => all.some((t) => t.startsWith(w)))) continue;
      seen.add(key);
      const score = words.filter((w) => name.some((t) => t.startsWith(w))).length;
      scored.push({ e, score, order: order++ });
    }
  return scored.sort((a, b) => b.score - a.score || a.order - b.order).map((s) => s.e);
}
