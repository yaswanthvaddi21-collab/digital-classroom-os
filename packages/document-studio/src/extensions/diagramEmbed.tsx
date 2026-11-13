import { mergeAttributes, Node } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from '@tiptap/react';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

/** What the app hands back after a diagram has been created or edited. */
export interface EmbeddedDiagram {
  /** The editable diagram itself (Diagram Studio content). Stored in the document. */
  source: unknown;
  /** Rendered PNG preview, stored separately in the attachments store. */
  previewId: string;
  /** Natural size of the rendered diagram in CSS pixels. */
  naturalWidth: number;
  naturalHeight: number;
  title: string;
}

export interface DiagramStart {
  templateId?: string;
  /** Existing diagram content (from My Diagrams or a diagrams.net import). */
  source?: unknown;
  title?: string;
  /** Things an import could not bring in exactly, shown to the user while editing. */
  notes?: string[];
}

/**
 * Supplied by the app. Keeps Document Studio independent of Diagram Studio: the app owns the diagram editor,
 * dialogs and storage, the document only stores what it returns.
 */
export interface DiagramHost {
  templates: Array<{ id: string; name: string }>;
  /** Opens the diagram editor; resolves with the saved diagram, or null when cancelled. */
  edit(current: EmbeddedDiagram | null, start?: DiagramStart): Promise<EmbeddedDiagram | null>;
  pickFromLibrary(): Promise<DiagramStart | null>;
  importFile(): Promise<DiagramStart | null>;
  loadPreview(previewId: string): Promise<Blob | undefined>;
  /** diagrams.net file for a diagram's source. */
  toDrawio(source: unknown, title: string): Promise<string>;
}

export interface DiagramAttrs extends EmbeddedDiagram {
  /** Display size in the document (CSS pixels). Height always follows the natural aspect ratio. */
  width: number;
  height: number;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    diagramEmbed: {
      insertDiagram: (diagram: EmbeddedDiagram, maxWidth: number) => ReturnType;
    };
  }
}

/** Display size that keeps the aspect ratio and never exceeds the page's text width. */
export function fitSize(naturalWidth: number, naturalHeight: number, width: number, maxWidth: number) {
  const w = Math.max(80, Math.min(Math.round(width), Math.round(maxWidth)));
  return { width: w, height: Math.round((w * naturalHeight) / Math.max(1, naturalWidth)) };
}

const previewUrls = new Map<string, Promise<string | null>>();
function previewUrl(host: DiagramHost | null, id: string | null): Promise<string | null> {
  if (!host || !id) return Promise.resolve(null);
  if (!previewUrls.has(id)) {
    previewUrls.set(
      id,
      host.loadPreview(id).then((blob) => (blob ? URL.createObjectURL(blob) : null)),
    );
  }
  return previewUrls.get(id)!;
}

function DiagramView({ node, selected, updateAttributes, editor, extension, getPos }: ReactNodeViewProps) {
  const host = (extension.options as { host: DiagramHost | null }).host;
  const attrs = node.attrs as DiagramAttrs;
  const [url, setUrl] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    setUrl(undefined);
    previewUrl(host, attrs.previewId).then((u) => live && setUrl(u));
    return () => {
      live = false;
    };
  }, [host, attrs.previewId]);

  const edit = async () => {
    if (!host || !editor.isEditable || busy) return;
    setBusy(true);
    try {
      const next = await host.edit({ source: attrs.source, previewId: attrs.previewId, naturalWidth: attrs.naturalWidth, naturalHeight: attrs.naturalHeight, title: attrs.title });
      // Keep the width the user chose; the height follows the edited diagram's new shape.
      if (next) updateAttributes({ ...next, ...fitSize(next.naturalWidth, next.naturalHeight, attrs.width, Number.MAX_SAFE_INTEGER) });
    } finally {
      setBusy(false);
    }
  };

  const startResize = (e: ReactPointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = attrs.width;
    const maxW = box.current?.parentElement?.clientWidth ?? 2000;
    const move = (ev: PointerEvent) => setDragWidth(fitSize(attrs.naturalWidth, attrs.naturalHeight, startW + ev.clientX - startX, maxW).width);
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setDragWidth(null);
      updateAttributes(fitSize(attrs.naturalWidth, attrs.naturalHeight, startW + ev.clientX - startX, maxW));
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const width = dragWidth ?? attrs.width;
  const height = Math.round((width * attrs.naturalHeight) / Math.max(1, attrs.naturalWidth));
  return (
    <NodeViewWrapper className={`dcos-diagram${selected ? ' is-selected' : ''}`} data-type="diagram" data-drag-handle="">
      <div
        ref={box}
        className="dcos-diagram-box"
        style={{ width, height }}
        // Select the diagram as a whole on click, so the Diagram tab's tools apply to it reliably.
        onMouseDown={(e) => {
          if (e.button !== 0 || (e.target as HTMLElement).classList.contains('dcos-diagram-handle')) return;
          const pos = getPos();
          if (typeof pos === 'number') editor.commands.setNodeSelection(pos);
        }}
        onDoubleClick={edit}
        title={editor.isEditable ? 'Double-click to edit this diagram' : attrs.title}>
        {url ? (
          <img src={url} alt={attrs.title || 'Diagram'} width={width} height={height} draggable={false} />
        ) : (
          <div className="dcos-diagram-missing" role="img" aria-label={attrs.title || 'Diagram'}>
            {url === undefined ? 'Loading diagram…' : `Diagram “${attrs.title || 'Untitled'}” — preview unavailable. Double-click to open and re-render it.`}
          </div>
        )}
        {selected && editor.isEditable && <span className="dcos-diagram-handle" onPointerDown={startResize} aria-hidden />}
        {busy && <div className="dcos-diagram-busy">Editing…</div>}
      </div>
    </NodeViewWrapper>
  );
}

/**
 * An editable diagram inside a document. The diagram's own data lives in `source`; the image shown and exported
 * is a separate PNG attachment (`previewId`) re-rendered whenever the diagram is edited.
 */
export const DiagramEmbed = Node.create<{ host: DiagramHost | null }>({
  name: 'diagram',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addOptions() {
    return { host: null };
  },

  addAttributes() {
    return {
      source: { default: null, rendered: false },
      previewId: { default: null, rendered: false },
      naturalWidth: { default: 400, rendered: false },
      naturalHeight: { default: 300, rendered: false },
      width: { default: 400, rendered: false },
      height: { default: 300, rendered: false },
      title: { default: '', rendered: false },
    };
  },

  parseHTML() {
    return [{ tag: 'figure[data-type="diagram"]' }];
  },

  renderHTML({ HTMLAttributes, node }) {
    return ['figure', mergeAttributes(HTMLAttributes, { 'data-type': 'diagram', 'aria-label': node.attrs.title || 'Diagram' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(DiagramView);
  },

  addCommands() {
    return {
      insertDiagram:
        (diagram, maxWidth) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { ...diagram, ...fitSize(diagram.naturalWidth, diagram.naturalHeight, diagram.naturalWidth, maxWidth) } }),
    };
  },
});
