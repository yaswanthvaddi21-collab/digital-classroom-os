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
`;
