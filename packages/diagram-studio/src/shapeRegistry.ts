import type { CSSProperties } from 'react';
import { LIBRARY_SHAPE_DEFS } from './library/defs';
import type { ShapeKind, ShapeStyle } from './types';

/**
 * The connection handles every shape draws (ShapeNode.tsx), by id. A connector's `sourceHandle`/`targetHandle` must be
 * one of these (or null); React Flow cannot draw a connector to any other id.
 */
export const HANDLE_IDS = ['t', 'r', 'b', 'l'] as const;
export type HandleId = (typeof HANDLE_IDS)[number];

/**
 * Everything the app knows about one shape kind, apart from how it is drawn (`SHAPE_RENDERERS` in shapes.tsx):
 * its default size and style, its entry in the shape library, its starting text, where its text sits, and the
 * diagrams.net style it is exported as. Data only (no React), so templates and the model can use it cheaply.
 *
 * Adding a shape kind: add it to `ShapeKind` (types.ts), an entry here, a renderer in `SHAPE_RENDERERS`, and, if
 * diagrams.net names it differently on import, a key in `DRAWIO_SHAPE_KEYS` (drawioRegistry.ts). A kind outside the
 * frozen schema-2 vocabulary (compat.ts) makes a diagram that uses it schema 3 automatically.
 */
export interface ShapeDef {
  kind: ShapeKind;
  width: number;
  height: number;
  /** Differences from the base style (white fill, slate outline, 2px, 14px text). */
  style?: Partial<Omit<ShapeStyle, 'shape'>>;
  /** Shape library entry. Kinds without one are not offered in the library. */
  catalog?: { name: string; hint: string };
  /** Starting text for shapes whose label has structure. */
  defaultLabel?: string;
  /** Text area inside the shape, inset so labels stay within diamonds, triangles and cylinders. */
  labelInset: CSSProperties;
  /** Resizing keeps the width/height ratio. */
  keepAspectRatio?: boolean;
  /** diagrams.net style the shape is exported with (the `dcosShape` key and colours are added by the exporter). */
  drawioStyle: string;
}

const COMPARTMENT_STYLE =
  'swimlane;fontStyle=1;align=center;verticalAlign=top;childLayout=stackLayout;horizontal=1;startSize=26;horizontalStack=0;resizeParent=1;resizeParentMax=0;resizeLast=0;';

/** In shape library order. */
export const SHAPE_DEFS: ShapeDef[] = [
  { kind: 'rounded', width: 160, height: 70, catalog: { name: 'Process', hint: 'Step or action' }, labelInset: { inset: '6px 10px' }, drawioStyle: 'rounded=1;whiteSpace=wrap;html=1;' },
  { kind: 'rectangle', width: 160, height: 70, catalog: { name: 'Rectangle', hint: 'Box / tree node' }, labelInset: { inset: '6px 10px' }, drawioStyle: 'rounded=0;whiteSpace=wrap;html=1;' },
  {
    kind: 'ellipse',
    width: 150,
    height: 80,
    style: { fill: '#e0e7ff', stroke: '#4f46e5' },
    catalog: { name: 'Start / End', hint: 'Terminator' },
    labelInset: { inset: '12% 14%' },
    drawioStyle: 'ellipse;whiteSpace=wrap;html=1;',
  },
  {
    kind: 'diamond',
    width: 150,
    height: 110,
    style: { fill: '#fef3c7', stroke: '#b45309' },
    catalog: { name: 'Decision', hint: 'Yes / No branch' },
    labelInset: { inset: '22% 18%' },
    drawioStyle: 'rhombus;whiteSpace=wrap;html=1;',
  },
  {
    kind: 'parallelogram',
    width: 170,
    height: 70,
    style: { fill: '#dcfce7', stroke: '#15803d' },
    catalog: { name: 'Input / Output', hint: 'Data in or out' },
    labelInset: { inset: '4px 18%' },
    drawioStyle: 'shape=parallelogram;perimeter=parallelogramPerimeter;whiteSpace=wrap;html=1;fixedSize=1;',
  },
  {
    kind: 'circle',
    width: 110,
    height: 110,
    catalog: { name: 'Circle', hint: 'Connector, Venn set' },
    labelInset: { inset: '12% 14%' },
    keepAspectRatio: true,
    drawioStyle: 'ellipse;whiteSpace=wrap;html=1;aspect=fixed;',
  },
  {
    kind: 'hexagon',
    width: 160,
    height: 80,
    style: { fill: '#f3e8ff', stroke: '#7e22ce' },
    catalog: { name: 'Preparation', hint: 'Setup step' },
    labelInset: { inset: '4px 18%' },
    drawioStyle: 'shape=hexagon;perimeter=hexagonPerimeter2;whiteSpace=wrap;html=1;fixedSize=1;',
  },
  {
    kind: 'cylinder',
    width: 120,
    height: 110,
    style: { fill: '#e0f2fe', stroke: '#0369a1' },
    catalog: { name: 'Database', hint: 'Stored data' },
    labelInset: { inset: '22% 8% 10% 8%' },
    drawioStyle: 'shape=cylinder3;whiteSpace=wrap;html=1;boundedLbl=1;backgroundOutline=1;size=15;',
  },
  { kind: 'document', width: 160, height: 90, catalog: { name: 'Document', hint: 'Report or file' }, labelInset: { inset: '6px 8px 18% 8px' }, drawioStyle: 'shape=document;whiteSpace=wrap;html=1;boundedLbl=1;' },
  { kind: 'triangle', width: 130, height: 110, catalog: { name: 'Triangle', hint: 'Merge / extract' }, labelInset: { inset: '40% 20% 6% 20%' }, drawioStyle: 'triangle;whiteSpace=wrap;html=1;direction=north;' },
  {
    kind: 'note',
    width: 160,
    height: 120,
    style: { fill: '#fef9c3', stroke: '#ca8a04', strokeWidth: 1 },
    catalog: { name: 'Sticky note', hint: 'Comment' },
    labelInset: { inset: '6px 10px' },
    drawioStyle: 'shape=note;whiteSpace=wrap;html=1;backgroundOutline=1;size=15;',
  },
  {
    kind: 'text',
    width: 160,
    height: 40,
    style: { fill: 'transparent', stroke: 'transparent', strokeWidth: 0, fontSize: 16 },
    catalog: { name: 'Text', hint: 'Free label' },
    labelInset: { inset: '6px 10px' },
    drawioStyle: 'text;html=1;align=center;verticalAlign=middle;whiteSpace=wrap;',
  },
  {
    kind: 'umlClass',
    width: 200,
    height: 130,
    style: { fill: '#ffffff', stroke: '#334155', fontSize: 13 },
    catalog: { name: 'UML class', hint: 'Name, attributes, methods' },
    defaultLabel: 'ClassName\n+ attribute: Type\n--\n+ method(): Type',
    labelInset: { inset: '0', alignItems: 'stretch', justifyContent: 'flex-start' },
    drawioStyle: `${COMPARTMENT_STYLE}collapsible=1;marginBottom=0;whiteSpace=wrap;html=1;`,
  },
  {
    kind: 'erEntity',
    width: 190,
    height: 120,
    style: { fill: '#ffffff', stroke: '#0369a1', fontSize: 13 },
    catalog: { name: 'ER entity', hint: 'Table and its fields' },
    defaultLabel: 'Entity\nPK id\nname\nFK other_id',
    labelInset: { inset: '0', alignItems: 'stretch', justifyContent: 'flex-start' },
    drawioStyle: `${COMPARTMENT_STYLE}collapsible=0;marginBottom=0;rounded=1;whiteSpace=wrap;html=1;`,
  },
  {
    kind: 'actor',
    width: 70,
    height: 110,
    style: { fill: '#ffffff', stroke: '#334155', fontSize: 13 },
    catalog: { name: 'Actor', hint: 'User or role (use case)' },
    defaultLabel: 'Actor',
    labelInset: { inset: 'auto 0 0 0', height: 22, alignItems: 'flex-end' },
    drawioStyle: 'shape=umlActor;verticalLabelPosition=bottom;verticalAlign=top;html=1;outlineConnect=0;',
  },
  {
    kind: 'package',
    width: 180,
    height: 110,
    style: { fill: '#fefce8', stroke: '#a16207' },
    catalog: { name: 'Package', hint: 'Group of classes or modules' },
    defaultLabel: 'package',
    labelInset: { inset: '22% 8px 6px 8px' },
    drawioStyle: 'shape=folder;fontStyle=1;spacingTop=10;tabWidth=60;tabHeight=18;tabPosition=left;html=1;whiteSpace=wrap;',
  },
  {
    // schema 3: the container of a group (shapes inside have `parentId` set to it). Not in the library: groups are
    // made from a selection. Drawn invisible, but its area can be clicked to select the group.
    kind: 'group',
    width: 200,
    height: 120,
    style: { fill: 'transparent', stroke: 'transparent', strokeWidth: 0 },
    labelInset: { inset: '6px 10px' },
    drawioStyle: 'group;',
  },
  {
    // schema 3 (G-DRAWIO): a picture from a diagrams.net file (`data.image`, an embedded data: URL). Not in the
    // library: the app has no picture picker yet, so image shapes come only from imported files.
    kind: 'image',
    width: 80,
    height: 80,
    style: { fill: 'transparent', stroke: 'transparent', strokeWidth: 0 },
    labelInset: { inset: 'auto 0 0 0', height: 22, alignItems: 'flex-end' },
    drawioStyle: 'shape=image;html=1;verticalLabelPosition=bottom;verticalAlign=top;imageAspect=1;',
  },
  // schema 3 (G-SHAPES): BPMN, UML, network and timeline shapes (library/defs.ts).
  ...LIBRARY_SHAPE_DEFS,
  // @phase5:shapes — new shape kinds (with a renderer in SHAPE_RENDERERS, shapes.tsx).
];

const BY_KIND = new Map<string, ShapeDef>(SHAPE_DEFS.map((d) => [d.kind, d]));

/** The definition of a kind, or undefined for a kind from a newer version. */
export function shapeDef(kind: string): ShapeDef | undefined {
  return BY_KIND.get(kind);
}

/** Shapes offered in the quick connect palette, in diagrams.net's spirit: the common ones first. */
export const QUICK_PALETTE: ShapeKind[] = [
  'rounded',
  'rectangle',
  'ellipse',
  'diamond',
  'parallelogram',
  'circle',
  'hexagon',
  'cylinder',
  'document',
  'note',
  'triangle',
  'text',
  'umlClass',
  'erEntity',
  'actor',
  // @phase5:shapes — quick connect palette entries.
];
