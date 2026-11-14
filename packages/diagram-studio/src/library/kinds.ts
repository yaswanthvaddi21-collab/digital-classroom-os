/**
 * Shape kinds added by the Phase 5 shape library (G-SHAPES): BPMN, UML sequence/activity/state/use case, network
 * icons and timelines. No imports, so types.ts can extend `ShapeKind` with these without an import cycle.
 *
 * Every kind here is outside the frozen schema-2 vocabulary (compat.ts), so a diagram that uses one is saved as
 * schema 3 automatically. Kinds are stored in saved diagrams: never rename or remove one.
 */
export const LIBRARY_KINDS = [
  // BPMN
  'bpmnPool',
  'bpmnLane',
  'bpmnStart',
  'bpmnIntermediate',
  'bpmnEnd',
  'bpmnTask',
  'bpmnSubprocess',
  'bpmnExclusive',
  'bpmnParallel',
  'bpmnInclusive',
  'bpmnDataObject',
  'bpmnDataStore',
  // UML sequence, activity, state and use case
  'umlLifeline',
  'umlActivation',
  'umlInitial',
  'umlFinal',
  'umlFork',
  'umlBoundary',
  // Network (original simple icons, label below)
  'netServer',
  'netDesktop',
  'netLaptop',
  'netRouter',
  'netSwitch',
  'netFirewall',
  'netCloud',
  'netDatabase',
  'netMobile',
  'netPrinter',
  'netAccessPoint',
  // Timelines
  'timelineDate',
] as const;

export type LibraryShapeKind = (typeof LIBRARY_KINDS)[number];

/**
 * Containers: shapes dropped inside one become its children (React Flow parent nodes, `parentId`), so they move with
 * it. A BPMN pool holds lanes and shapes, a lane holds shapes, a UML system boundary holds use cases.
 */
export const CONTAINER_KINDS: ReadonlySet<string> = new Set<LibraryShapeKind>(['bpmnPool', 'bpmnLane', 'umlBoundary']);

/** Width of the title band on the left of a pool and of a lane (at full size; small previews scale it down). */
export const POOL_BAND = 30;
export const LANE_BAND = 24;
/** Height of a lifeline's head box. */
export const LIFELINE_HEAD = 40;
/** Height of the label band under a network icon. */
export const ICON_LABEL = 22;

/**
 * Where each library kind draws its text, for renderers that do not use the canvas's CSS (a vector SVG export):
 * - `inside`: centred in the shape (the default for kinds not listed);
 * - `below`: under the shape, outside its box, like diagrams.net's verticalLabelPosition=bottom;
 * - `band-left`: rotated 90° anticlockwise in the title band on the left (`POOL_BAND` / `LANE_BAND` wide);
 * - `top`: at the top of the box (a system boundary's name, a lifeline's head `LIFELINE_HEAD` high);
 * - `icon-below`: in the `ICON_LABEL` band at the bottom of the box (network icons).
 */
export const LABEL_PLACEMENT: Partial<Record<LibraryShapeKind, 'below' | 'band-left' | 'top' | 'icon-below'>> = {
  bpmnPool: 'band-left',
  bpmnLane: 'band-left',
  bpmnStart: 'below',
  bpmnIntermediate: 'below',
  bpmnEnd: 'below',
  bpmnExclusive: 'below',
  bpmnParallel: 'below',
  bpmnInclusive: 'below',
  bpmnDataObject: 'below',
  bpmnDataStore: 'below',
  umlInitial: 'below',
  umlFinal: 'below',
  umlFork: 'below',
  umlLifeline: 'top',
  umlBoundary: 'top',
  netServer: 'icon-below',
  netDesktop: 'icon-below',
  netLaptop: 'icon-below',
  netRouter: 'icon-below',
  netSwitch: 'icon-below',
  netFirewall: 'icon-below',
  netCloud: 'icon-below',
  netDatabase: 'icon-below',
  netMobile: 'icon-below',
  netPrinter: 'icon-below',
  netAccessPoint: 'icon-below',
};
