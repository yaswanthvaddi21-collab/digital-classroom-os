/** Styles for connector handles (G-CONNECT). Selection chrome only: none of it is drawn in exports. */
export const connectCss = `
/* Connection handles grow on hover without losing React Flow's centring translate (a plain transform: scale() would
   replace it, moving the dot out from under the pointer so a drag could not start on it). */
.dcos-handle.react-flow__handle-top:hover, .dcos-handle.react-flow__handle-left:hover { transform: translate(-50%, -50%) scale(1.25); }
.dcos-handle.react-flow__handle-right:hover { transform: translate(50%, -50%) scale(1.25); }
.dcos-handle.react-flow__handle-bottom:hover { transform: translate(-50%, 50%) scale(1.25); }
/* Above selected connectors and shapes, which React Flow lifts to z-index 1000 in the same stacking context. */
.dcos-connect-layer { position: absolute; left: 0; top: 0; width: 0; height: 0; overflow: visible; z-index: 2000; }
.dcos-connect-layer button, .dcos-connect-layer .dcos-port-hint {
  position: absolute; left: 0; top: 0; padding: 0; pointer-events: all; touch-action: none; -webkit-tap-highlight-color: transparent;
}
.dcos-bend { width: 12px; height: 12px; border-radius: 2px; background: #fff; border: 2px solid #2997f2; cursor: move; }
.dcos-bend-add { width: 10px; height: 10px; border-radius: 9999px; background: rgba(41, 151, 242, 0.35); border: 1.5px solid #2997f2; cursor: copy; opacity: 0.75; }
.dcos-bend-add:hover { opacity: 1; background: rgba(41, 151, 242, 0.6); }
.dcos-end-grip { width: 12px; height: 12px; border-radius: 9999px; background: #2997f2; border: 2px solid #fff; box-shadow: 0 0 0 1px #2997f2; cursor: crosshair; }
.dcos-end-grip.dcos-active { background: #1a7fe0; box-shadow: 0 0 0 3px rgba(41, 151, 242, 0.35); }
.dcos-port { width: 11px; height: 11px; border-radius: 9999px; background: #fff; border: 2px solid #2997f2; cursor: pointer; }
.dcos-port.dcos-active, .dcos-port:hover { background: #2997f2; }
.dcos-port-hint { pointer-events: none !important; opacity: 0.85; }
.dcos-port-float { width: 18px; height: 18px; border-radius: 9999px; background: rgba(41, 151, 242, 0.08); border: 2px dashed #2997f2; cursor: pointer; }
.dcos-port-float.dcos-active, .dcos-port-float:hover { background: rgba(41, 151, 242, 0.35); }
.dcos-connect-layer button:focus-visible { outline: none; box-shadow: 0 0 0 2px #fff, 0 0 0 4px #1a7fe0; }
.dcos-connect-preview { position: absolute; left: 0; top: 0; width: 1px; height: 1px; overflow: visible; pointer-events: none; }
.dcos-connect-preview line { stroke: #2997f2; stroke-width: 2; stroke-dasharray: 6 4; }
.dcos-connect-preview rect { fill: rgba(41, 151, 242, 0.08); stroke: #2997f2; stroke-width: 2; }
.dcos-edge-label-drag { cursor: move; touch-action: none; }
.dcos-edge-label-editor {
  position: absolute; left: 0; top: 0; z-index: 2000; pointer-events: all; min-width: 80px; width: 160px; padding: 3px 6px; border-radius: 4px;
  border: 1.5px solid #2997f2; background: #fff; color: #0f172a; font: 500 12px 'Inter Variable', ui-sans-serif, system-ui, sans-serif;
  text-align: center; outline: none; box-shadow: 0 2px 8px rgba(15, 23, 42, 0.15);
}
@media (pointer: coarse) {
  .dcos-bend { width: 18px; height: 18px; }
  .dcos-bend-add { width: 16px; height: 16px; }
  .dcos-end-grip { width: 18px; height: 18px; }
  .dcos-port { width: 18px; height: 18px; }
}
`;
