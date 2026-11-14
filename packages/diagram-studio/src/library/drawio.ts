import type { DrawioVertexReader } from '../drawioRegistry';
import type { ShapeKind } from '../types';

/*
 * diagrams.net import names for the library's shapes (G-SHAPES). Our own exports carry `dcosShape=<kind>` and need
 * none of this; these map files drawn in diagrams.net. Pools and lanes (swimlanes) are mapped by G-DRAWIO's hook
 * DRAWIO_SWIMLANE_KINDS (drawioFeatures.ts), which names `bpmnPool` and `bpmnLane`.
 */

/** diagrams.net `shape=` values and the library kind they import as (refined by LIBRARY_VERTEX_READER). */
export const LIBRARY_DRAWIO_SHAPE_KEYS: Record<string, ShapeKind> = {
  'mxgraph.bpmn.event': 'bpmnStart',
  'mxgraph.bpmn.gateway2': 'bpmnExclusive',
  'mxgraph.bpmn.data': 'bpmnDataObject',
  'mxgraph.bpmn.task': 'bpmnTask',
  umlLifeline: 'umlLifeline',
  startState: 'umlInitial',
  endState: 'umlFinal',
  'mxgraph.networks.server': 'netServer',
  'mxgraph.networks.pc': 'netDesktop',
  'mxgraph.networks.laptop': 'netLaptop',
  'mxgraph.networks.router': 'netRouter',
  'mxgraph.networks.switch': 'netSwitch',
  'mxgraph.networks.firewall': 'netFirewall',
  'mxgraph.networks.cloud': 'netCloud',
  'mxgraph.networks.storage': 'netDatabase',
  'mxgraph.networks.mobile': 'netMobile',
  'mxgraph.networks.printer': 'netPrinter',
  'mxgraph.networks.wireless_hub': 'netAccessPoint',
};

/**
 * Refines BPMN events and gateways drawn in diagrams.net: an event's `outline` says start, intermediate or end, a
 * gateway's `gwType` says exclusive, parallel or inclusive. Kinds this app has no shape for import as the nearest one
 * with a note (event types and complex or event-based gateways).
 */
export const LIBRARY_VERTEX_READER: DrawioVertexReader = (cell, node, ctx) => {
  if (cell.st.map.has('dcosShape')) return;
  const shape = cell.st.map.get('shape');
  if (shape === 'mxgraph.bpmn.event') {
    const outline = cell.st.map.get('outline') ?? 'standard';
    if (outline === 'end') {
      node.data.shape = 'bpmnEnd';
      if (!cell.st.map.has('strokeWidth')) node.data.strokeWidth = 4;
    } else if (outline !== 'standard' && outline !== 'eventInt' && outline !== 'eventNonint') node.data.shape = 'bpmnIntermediate';
    const symbol = cell.st.map.get('symbol');
    if (symbol && symbol !== 'general') ctx.notes.add('BPMN event symbols (message, timer …) were not imported: the events are drawn plain.');
  }
  if (shape === 'mxgraph.bpmn.gateway2') {
    const type = cell.st.map.get('gwType') ?? 'exclusive';
    if (type === 'parallel') node.data.shape = 'bpmnParallel';
    else if (type === 'inclusive') node.data.shape = 'bpmnInclusive';
    else if (type !== 'exclusive') ctx.notes.add('Complex and event-based BPMN gateways were imported as exclusive gateways.');
  }
};
