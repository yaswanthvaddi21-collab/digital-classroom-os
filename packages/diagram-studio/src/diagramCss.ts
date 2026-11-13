/** Canvas and node styles. The canvas is always light "paper" so diagrams look the same when exported. */
export const diagramCss = `
.dcos-flow { background: #f8f8fa; }
.dcos-flow .react-flow__pane { cursor: default; }
.dcos-flow.dcos-pan .react-flow__pane { cursor: grab; }
.dcos-shape { position: relative; }
.dcos-shape-svg { position: absolute; inset: 0; overflow: visible; }
.dcos-shape-label {
  position: absolute; display: flex; align-items: center; justify-content: center; text-align: center;
  line-height: 1.25; white-space: pre-wrap; word-break: break-word; overflow: hidden;
  font-family: 'Inter Variable', ui-sans-serif, system-ui, sans-serif;
}
.dcos-compartments { display: flex; flex-direction: column; width: 100%; height: 100%; text-align: left; line-height: 1.35; }
.dcos-compartment-header { text-align: center; padding: 6px 8px; border-radius: 4px 4px 0 0; }
.dcos-compartment { padding: 4px 8px; }
.dcos-compartment:last-child { flex: 1; }
.dcos-compartment-row { white-space: pre; overflow: hidden; text-overflow: ellipsis; font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace; font-size: 0.92em; }
.dcos-label-placeholder { color: #9ca3af; font-size: 12px; font-weight: 400; font-style: italic; }
.dcos-label-editor {
  width: 100%; height: 100%; resize: none; border: none; outline: none; background: transparent;
  text-align: center; font-family: inherit; line-height: 1.25; padding: 0; display: flex; align-items: center;
}
.dcos-handle.react-flow__handle {
  width: 10px; height: 10px; border-radius: 9999px; background: #fff; border: 2px solid #6366f1;
  opacity: 0; transition: opacity 120ms;
}
.react-flow__node:hover .dcos-handle, .react-flow__node.selected .dcos-handle, .react-flow.connecting .dcos-handle { opacity: 1; }
.dcos-handle.react-flow__handle:hover { background: #6366f1; transform: scale(1.25); }
.react-flow__node.selected .dcos-shape-svg { filter: drop-shadow(0 0 0.5px #6366f1) drop-shadow(0 0 3px rgba(99,102,241,.45)); }
.dcos-resize-line { border-color: #6366f1 !important; }
.dcos-resize-handle { width: 8px !important; height: 8px !important; border-radius: 2px; background: #fff !important; border: 1.5px solid #6366f1 !important; }
.react-flow__edge.selected .react-flow__edge-path, .react-flow__edge:focus .react-flow__edge-path { filter: drop-shadow(0 0 2px rgba(99,102,241,.8)); }
.react-flow__edge-textbg { stroke: #e5e7eb; stroke-width: 1; }
.react-flow__connection-path { stroke: #6366f1; stroke-width: 2; }
.react-flow__controls { box-shadow: 0 1px 3px rgba(0,0,0,.1); border-radius: 10px; overflow: hidden; }
.react-flow__controls-button { width: 28px; height: 28px; }
.react-flow__minimap { border-radius: 10px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.1); }
@media (max-width: 640px) { .react-flow__minimap { display: none; } }

/* Quick connect: blue directional arrows around the selected shape (diagrams.net style).
   The renderer must not form its own stacking context, or the minimap and controls would cover the arrows. */
.dcos-flow .react-flow__renderer { z-index: auto; }
.dcos-qc { z-index: 5; }
.dcos-qc-group { display: flex; align-items: center; gap: 6px; animation: dcos-qc-in 140ms ease-out; }
.dcos-qc-top .dcos-qc-group { flex-direction: column-reverse; }
.dcos-qc-bottom .dcos-qc-group { flex-direction: column; }
.dcos-qc-left .dcos-qc-group { flex-direction: row-reverse; }
.dcos-qc-arrow {
  display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; padding: 0; border: 0;
  border-radius: 9999px; background: transparent; color: rgba(41, 151, 242, 0.75); cursor: pointer; touch-action: none;
  transition: color 120ms, background-color 120ms, scale 120ms;
}
.dcos-qc-arrow:hover, .dcos-qc-arrow:focus-visible { color: #1a7fe0; background: rgba(41, 151, 242, 0.12); scale: 1.15; outline: none; }
.dcos-qc-arrow:focus-visible { box-shadow: 0 0 0 2px #1a7fe0; }
.dcos-qc-arrow:active { scale: 0.95; }
.dcos-qc-palette {
  z-index: 60; font-family: 'Inter Variable', ui-sans-serif, system-ui, sans-serif;
  display: grid; grid-template-columns: repeat(5, 30px); gap: 2px; padding: 4px; border-radius: 10px;
  background: #ffffff; border: 1px solid #e2e8f0; box-shadow: 0 6px 20px rgba(15, 23, 42, 0.14); animation: dcos-qc-in 120ms ease-out;
}
.dcos-qc-shape { display: flex; align-items: center; justify-content: center; width: 30px; height: 30px; border: 0; border-radius: 6px; background: transparent; color: #0f172a; cursor: pointer; }
.dcos-qc-shape:hover, .dcos-qc-shape:focus-visible { background: #e0f0ff; outline: none; }
.dcos-qc-ghost { position: absolute; left: 0; top: 0; border: 2px dashed #2997f2; border-radius: 8px; background: rgba(41, 151, 242, 0.06); pointer-events: none; }
.dcos-qc-preview { position: absolute; left: 0; top: 0; width: 1px; height: 1px; overflow: visible; pointer-events: none; }
.dcos-qc-preview line { stroke: #2997f2; stroke-width: 2; stroke-dasharray: 6 4; }
.dcos-qc-preview circle { fill: #2997f2; }
.dcos-qc-target { fill: rgba(41, 151, 242, 0.08); stroke: #2997f2; stroke-width: 2; }
@keyframes dcos-qc-in { from { opacity: 0; scale: 0.85; } }
@media (prefers-reduced-motion: reduce) { .dcos-qc-group, .dcos-qc-palette { animation: none; } .dcos-qc-arrow { transition: none; } }
`;
