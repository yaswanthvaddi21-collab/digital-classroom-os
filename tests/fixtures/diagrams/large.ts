/**
 * Generated large diagrams for scale tests (TD-19). Deterministic, and free of runtime imports so both Vitest and
 * Playwright can load it. The diagram is schema-2 content: a forest of trees laid out on a grid, every shape kind of
 * schema 2, a cross-link every seventh shape, labels, and a mix of line types and markers.
 */
import type { DiagramContent, SerializedEdge, SerializedNode, ShapeKind } from '../../../packages/diagram-studio/src/types';

const KINDS: ShapeKind[] = ['rounded', 'rectangle', 'ellipse', 'diamond', 'parallelogram', 'circle', 'hexagon', 'cylinder', 'document', 'note', 'triangle', 'umlClass', 'erEntity', 'actor', 'package'];
const FILLS = ['#ffffff', '#e0e7ff', '#dcfce7', '#fef3c7', '#fce7f3'];
const LINES = ['smoothstep', 'step', 'straight', 'default'] as const;
const MARKERS = ['arrow', 'open-arrow', 'triangle', 'diamond', 'crow-many'] as const;
const COLUMNS = 25;

export function generateLargeDiagram(count: number): DiagramContent {
  const nodes: SerializedNode[] = [];
  const edges: SerializedEdge[] = [];
  for (let i = 0; i < count; i++) {
    const shape = KINDS[i % KINDS.length];
    nodes.push({
      id: `n${i}`,
      position: { x: (i % COLUMNS) * 220, y: Math.floor(i / COLUMNS) * 160 },
      width: 160,
      height: 90,
      data: {
        shape,
        fill: FILLS[i % FILLS.length],
        stroke: '#334155',
        strokeWidth: 2,
        textColor: '#0f172a',
        fontSize: 13,
        dashed: i % 11 === 0,
        bold: i % 5 === 0,
        label: shape === 'umlClass' ? `Class${i}\n+ id: int\n--\n+ run()` : shape === 'erEntity' ? `TABLE_${i}\nPK id\nname` : `Step ${i}`,
      },
    });
    // A tree: each shape after the first hangs off an earlier one; every seventh also links across.
    if (i > 0) edges.push(edge(`e${i}`, `n${Math.floor((i - 1) / 3)}`, `n${i}`, i));
    if (i > 7 && i % 7 === 0) edges.push(edge(`x${i}`, `n${i - 7}`, `n${i}`, i));
  }
  return { schemaVersion: 2, nodes, edges, viewport: null, settings: { snapToGrid: true, showGrid: true, autoLayout: 'none' } };
}

function edge(id: string, source: string, target: string, i: number): SerializedEdge {
  return {
    id,
    source,
    target,
    sourceHandle: 'b',
    targetHandle: 't',
    type: LINES[i % LINES.length],
    label: i % 9 === 0 ? `link ${i}` : '',
    data: { color: i % 2 ? '#475569' : '#4f46e5', width: 2, dashed: i % 13 === 0, arrow: 'end', endMarker: MARKERS[i % MARKERS.length] },
  };
}

/** The same diagram as a .dcosdiagram file's text. */
export function largeDiagramFile(count: number, title = `Large ${count}`): string {
  return JSON.stringify({ format: 'dcos-diagram', version: 1, app: 'test', title, diagram: generateLargeDiagram(count) });
}
