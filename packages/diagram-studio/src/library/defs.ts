import type { CSSProperties } from 'react';
import type { ShapeDef } from '../shapeRegistry';
import { ICON_LABEL, LANE_BAND, LIFELINE_HEAD, POOL_BAND } from './kinds';

/*
 * Shape definitions for the Phase 5 library kinds (see library/kinds.ts). Spread into SHAPE_DEFS (shapeRegistry.ts);
 * drawn by LIBRARY_RENDERERS (library/renderers.tsx). Each `drawioStyle` is the nearest diagrams.net style: a
 * built-in shape where one fits (ellipse, rhombus, note, datastore, swimlane, umlLifeline, startState, endState),
 * a diagrams.net stencil name for the network icons. The exporter adds `dcosShape=<kind>`, so this app reads every
 * kind back exactly whatever diagrams.net draws for it.
 */

/** Text under the shape, outside its box (diagrams.net's verticalLabelPosition=bottom). */
const BELOW: CSSProperties = { inset: '100% -60px auto -60px', height: 36, paddingTop: 3, alignItems: 'flex-start' };
/** Text rotated in the title band on the left of a pool or lane. */
const band = (width: number): CSSProperties => ({ inset: '0 auto 0 0', width, writingMode: 'vertical-rl', transform: 'rotate(180deg)', padding: '6px 0' });
/** Text in the band under a network icon. */
const ICON_TEXT: CSSProperties = { inset: 'auto -20px 0 -20px', height: ICON_LABEL, alignItems: 'flex-end' };

const icon = (kind: ShapeDef['kind'], name: string, hint: string, stencil: string): ShapeDef => ({
  kind,
  width: 96,
  height: 92,
  style: { fill: '#e0f2fe', stroke: '#0369a1', strokeWidth: 2, fontSize: 13 },
  catalog: { name, hint },
  defaultLabel: name,
  labelInset: ICON_TEXT,
  drawioStyle: `shape=mxgraph.networks.${stencil};html=1;whiteSpace=wrap;verticalLabelPosition=bottom;verticalAlign=top;`,
});

// diagrams.net's own BPMN stencils (mxgraph.bpmn.event / gateway2), so the event type and the gateway mark survive
// there too (not checked in diagrams.net itself); `dcosShape` brings the exact kind back here.
const EVENT_STYLE = 'shape=mxgraph.bpmn.event;html=1;whiteSpace=wrap;aspect=fixed;perimeter=ellipsePerimeter;outlineConnect=0;symbol=general;verticalLabelPosition=bottom;verticalAlign=top;';
const gatewayStyle = (gwType: 'exclusive' | 'parallel' | 'inclusive') =>
  `shape=mxgraph.bpmn.gateway2;html=1;whiteSpace=wrap;perimeter=rhombusPerimeter;outlineConnect=0;outline=none;symbol=none;gwType=${gwType};verticalLabelPosition=bottom;verticalAlign=top;`;

export const LIBRARY_SHAPE_DEFS: ShapeDef[] = [
  // ── BPMN ──────────────────────────────────────────────────────────────────────────────────────────
  {
    kind: 'bpmnPool',
    width: 640,
    height: 260,
    style: { fill: '#f8fafc', stroke: '#334155', bold: true },
    catalog: { name: 'Pool', hint: 'Participant; holds lanes and steps' },
    defaultLabel: 'Pool',
    labelInset: band(POOL_BAND),
    drawioStyle: `swimlane;horizontal=0;html=1;whiteSpace=wrap;startSize=${POOL_BAND};`,
  },
  {
    kind: 'bpmnLane',
    width: 610,
    height: 130,
    style: { fill: '#ffffff', stroke: '#64748b', strokeWidth: 1.5 },
    catalog: { name: 'Lane', hint: 'Role inside a pool; holds steps' },
    defaultLabel: 'Lane',
    labelInset: band(LANE_BAND),
    drawioStyle: `swimlane;horizontal=0;html=1;whiteSpace=wrap;startSize=${LANE_BAND};`,
  },
  {
    kind: 'bpmnStart',
    width: 50,
    height: 50,
    style: { fill: '#f0fdf4', stroke: '#15803d', fontSize: 12 },
    catalog: { name: 'Start event', hint: 'Where the process begins' },
    labelInset: BELOW,
    keepAspectRatio: true,
    drawioStyle: `${EVENT_STYLE}outline=standard;`,
  },
  {
    kind: 'bpmnIntermediate',
    width: 50,
    height: 50,
    style: { fill: '#fffbeb', stroke: '#b45309', fontSize: 12 },
    catalog: { name: 'Intermediate event', hint: 'Something that happens on the way' },
    labelInset: BELOW,
    keepAspectRatio: true,
    drawioStyle: `${EVENT_STYLE}outline=catching;`,
  },
  {
    kind: 'bpmnEnd',
    width: 50,
    height: 50,
    style: { fill: '#fef2f2', stroke: '#b91c1c', strokeWidth: 4, fontSize: 12 },
    catalog: { name: 'End event', hint: 'Where the process ends' },
    labelInset: BELOW,
    keepAspectRatio: true,
    drawioStyle: `${EVENT_STYLE}outline=end;`,
  },
  {
    kind: 'bpmnTask',
    width: 140,
    height: 80,
    style: { fill: '#eff6ff', stroke: '#1d4ed8', fontSize: 13 },
    catalog: { name: 'Task', hint: 'One unit of work' },
    labelInset: { inset: '6px 10px' },
    drawioStyle: 'rounded=1;arcSize=12;whiteSpace=wrap;html=1;',
  },
  {
    kind: 'bpmnSubprocess',
    width: 150,
    height: 90,
    style: { fill: '#eff6ff', stroke: '#1d4ed8', fontSize: 13 },
    catalog: { name: 'Sub-process', hint: 'A task made of further steps' },
    labelInset: { inset: '6px 10px 22px 10px' },
    drawioStyle: 'rounded=1;arcSize=12;whiteSpace=wrap;html=1;',
  },
  {
    kind: 'bpmnExclusive',
    width: 56,
    height: 56,
    style: { fill: '#fefce8', stroke: '#a16207', fontSize: 12 },
    catalog: { name: 'Exclusive gateway', hint: 'Exactly one path (XOR)' },
    labelInset: BELOW,
    keepAspectRatio: true,
    drawioStyle: gatewayStyle('exclusive'),
  },
  {
    kind: 'bpmnParallel',
    width: 56,
    height: 56,
    style: { fill: '#fefce8', stroke: '#a16207', fontSize: 12 },
    catalog: { name: 'Parallel gateway', hint: 'All paths at once (AND)' },
    labelInset: BELOW,
    keepAspectRatio: true,
    drawioStyle: gatewayStyle('parallel'),
  },
  {
    kind: 'bpmnInclusive',
    width: 56,
    height: 56,
    style: { fill: '#fefce8', stroke: '#a16207', fontSize: 12 },
    catalog: { name: 'Inclusive gateway', hint: 'One or more paths (OR)' },
    labelInset: BELOW,
    keepAspectRatio: true,
    drawioStyle: gatewayStyle('inclusive'),
  },
  {
    kind: 'bpmnDataObject',
    width: 44,
    height: 56,
    style: { fill: '#ffffff', stroke: '#475569', fontSize: 12 },
    catalog: { name: 'Data object', hint: 'Information a step uses or makes' },
    labelInset: BELOW,
    drawioStyle: 'shape=note;size=14;html=1;whiteSpace=wrap;verticalLabelPosition=bottom;verticalAlign=top;',
  },
  {
    kind: 'bpmnDataStore',
    width: 60,
    height: 56,
    style: { fill: '#ffffff', stroke: '#475569', fontSize: 12 },
    catalog: { name: 'Data store', hint: 'Where data is kept' },
    labelInset: BELOW,
    drawioStyle: 'shape=datastore;html=1;whiteSpace=wrap;verticalLabelPosition=bottom;verticalAlign=top;',
  },
  // ── UML ───────────────────────────────────────────────────────────────────────────────────────────
  {
    kind: 'umlLifeline',
    width: 130,
    height: 380,
    style: { fill: '#ffffff', stroke: '#334155', fontSize: 13 },
    catalog: { name: 'Lifeline', hint: 'A participant in a sequence diagram' },
    defaultLabel: ':Object',
    labelInset: { inset: '0 4px auto 4px', height: LIFELINE_HEAD },
    drawioStyle: `shape=umlLifeline;perimeter=lifelinePerimeter;whiteSpace=wrap;html=1;container=0;collapsible=0;recursiveResize=0;outlineConnect=0;size=${LIFELINE_HEAD};`,
  },
  {
    kind: 'umlActivation',
    width: 16,
    height: 60,
    style: { fill: '#ffffff', stroke: '#334155', strokeWidth: 1.5 },
    catalog: { name: 'Activation', hint: 'Time a participant is busy' },
    labelInset: { inset: '0' },
    drawioStyle: 'html=1;points=[];perimeter=orthogonalPerimeter;outlineConnect=0;',
  },
  {
    kind: 'umlInitial',
    width: 30,
    height: 30,
    style: { fill: '#0f172a', stroke: '#0f172a', fontSize: 12 },
    catalog: { name: 'Initial node', hint: 'Start of an activity or state machine' },
    labelInset: BELOW,
    keepAspectRatio: true,
    drawioStyle: 'ellipse;html=1;shape=startState;aspect=fixed;verticalLabelPosition=bottom;verticalAlign=top;',
  },
  {
    kind: 'umlFinal',
    width: 34,
    height: 34,
    style: { fill: '#0f172a', stroke: '#0f172a', fontSize: 12 },
    catalog: { name: 'Final node', hint: 'End of an activity or state machine' },
    labelInset: BELOW,
    keepAspectRatio: true,
    drawioStyle: 'ellipse;html=1;shape=endState;aspect=fixed;verticalLabelPosition=bottom;verticalAlign=top;',
  },
  {
    kind: 'umlFork',
    width: 160,
    height: 10,
    style: { fill: '#0f172a', stroke: '#0f172a', strokeWidth: 1, fontSize: 12 },
    catalog: { name: 'Fork / join bar', hint: 'Split into or join parallel flows' },
    labelInset: BELOW,
    drawioStyle: 'rounded=0;html=1;whiteSpace=wrap;verticalLabelPosition=bottom;verticalAlign=top;',
  },
  {
    kind: 'umlBoundary',
    width: 320,
    height: 340,
    style: { fill: '#ffffff', stroke: '#334155', bold: true },
    catalog: { name: 'System boundary', hint: 'The system; holds its use cases' },
    defaultLabel: 'System',
    labelInset: { inset: '8px 8px auto 8px', height: 24, alignItems: 'flex-start' },
    drawioStyle: 'rounded=0;whiteSpace=wrap;html=1;verticalAlign=top;',
  },
  // ── Network ───────────────────────────────────────────────────────────────────────────────────────
  icon('netServer', 'Server', 'Rack or tower server', 'server'),
  icon('netDesktop', 'Desktop', 'Desktop computer', 'pc'),
  icon('netLaptop', 'Laptop', 'Laptop computer', 'laptop'),
  icon('netRouter', 'Router', 'Connects networks', 'router'),
  icon('netSwitch', 'Switch', 'Connects devices on a network', 'switch'),
  icon('netFirewall', 'Firewall', 'Filters traffic', 'firewall'),
  icon('netCloud', 'Cloud', 'Internet or cloud service', 'cloud'),
  icon('netDatabase', 'Database server', 'Stored data', 'storage'),
  icon('netMobile', 'Phone', 'Mobile phone or tablet', 'mobile'),
  icon('netPrinter', 'Printer', 'Network printer', 'printer'),
  icon('netAccessPoint', 'Wi-Fi access point', 'Wireless access', 'wireless_hub'),
  // ── Timelines ─────────────────────────────────────────────────────────────────────────────────────
  {
    kind: 'timelineDate',
    width: 96,
    height: 40,
    style: { fill: '#4f46e5', stroke: '#4338ca', textColor: '#ffffff', bold: true },
    catalog: { name: 'Timeline date', hint: 'A date on the timeline axis' },
    defaultLabel: 'Date',
    labelInset: { inset: '4px 8px' },
    drawioStyle: 'rounded=1;arcSize=50;whiteSpace=wrap;html=1;',
  },
];
