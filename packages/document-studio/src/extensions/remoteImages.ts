import { Extension } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';

/** Images whose picture lives on another website: they need a connection to show and cannot go into exports. */
export const isRemoteImageSrc = (src: unknown): src is string => typeof src === 'string' && /^(https?:)?\/\//i.test(src.trim());

export const REMOTE_IMAGE_LABEL = 'Not saved for offline use';

/** Counts images in a document that are not stored in it (see isRemoteImageSrc). */
export function countRemoteImages(doc: { type?: string; attrs?: Record<string, unknown>; content?: unknown[] }): number {
  let n = doc.type === 'image' && isRemoteImageSrc(doc.attrs?.src) ? 1 : 0;
  for (const child of (doc.content ?? []) as (typeof doc)[]) n += countRemoteImages(child);
  return n;
}

export interface RemoteImagesOptions {
  /**
   * Turns a remote image into a data URL that is stored in the document, or null when that is not possible (no
   * connection, or the website does not allow it). Supplied by the editor; null disables fetching.
   */
  inline: ((src: string) => Promise<string | null>) | null;
}

interface RemoteState {
  /**
   * Remote images the latest paste or drop added, numbered by `batch` so the view handles each batch once. They are
   * kept through the transactions that follow until the view sees them: other plugins append transactions to a paste
   * (a trailing paragraph, autolinked text), and the view is only updated after all of them.
   */
  pending: string[];
  batch: number;
  decorations: DecorationSet;
}
const key = new PluginKey<RemoteState>('dcosRemoteImages');

function remoteImages(doc: PMNode, from = 0, to = doc.content.size) {
  const found: Array<{ pos: number; node: PMNode }> = [];
  doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name === 'image' && isRemoteImageSrc(node.attrs.src)) found.push({ pos, node });
  });
  return found;
}

function decorations(state: EditorState) {
  return DecorationSet.create(
    state.doc,
    remoteImages(state.doc).map(({ pos, node }) =>
      Decoration.node(pos, pos + node.nodeSize, { class: 'dcos-image-remote', 'data-offline-label': REMOTE_IMAGE_LABEL, title: `${REMOTE_IMAGE_LABEL}: ${node.attrs.src}` }),
    ),
  );
}

/**
 * Pictures pasted or dropped from a web page arrive as links to that website (audit DS-3). This tries once to fetch
 * each one and store it in the document as a data URL. When that fails the picture is kept as it is, marked
 * "Not saved for offline use", and exports count it. Images already in a document are never changed on open.
 */
export const RemoteImages = Extension.create<RemoteImagesOptions>({
  name: 'remoteImages',

  addOptions() {
    return { inline: null };
  },

  addProseMirrorPlugins() {
    const inline = this.options.inline;
    const attempted = new Set<string>();
    return [
      new Plugin({
        key,
        state: {
          init: (_config, state): RemoteState => ({ pending: [], batch: 0, decorations: decorations(state) }),
          apply(tr, value, _old, state): RemoteState {
            if (!tr.docChanged) return value;
            const event = tr.getMeta('uiEvent');
            if (event !== 'paste' && event !== 'drop') return { ...value, decorations: decorations(state) };
            const pending: string[] = [];
            tr.mapping.maps.forEach((map, i) =>
              map.forEach((_a, _b, start, end) => {
                const from = tr.mapping.slice(i + 1).map(start, -1);
                const to = tr.mapping.slice(i + 1).map(end, 1);
                for (const { node } of remoteImages(tr.doc, from, to)) pending.push(String(node.attrs.src));
              }),
            );
            return { pending, batch: value.batch + 1, decorations: decorations(state) };
          },
        },
        props: {
          decorations: (state) => key.getState(state)?.decorations,
        },
        view: () => {
          let handled = 0;
          return {
            update(view: EditorView) {
              const remote = key.getState(view.state);
              if (!inline || !remote || remote.batch === handled) return;
              handled = remote.batch;
              for (const src of remote.pending) {
                if (attempted.has(src)) continue;
                attempted.add(src);
                void inline(src).then((dataUrl) => {
                  if (!dataUrl || view.isDestroyed) return;
                  const tr = view.state.tr;
                  for (const { pos, node } of remoteImages(view.state.doc)) {
                    if (node.attrs.src === src) tr.setNodeMarkup(pos, undefined, { ...node.attrs, src: dataUrl });
                  }
                  // Part of the paste, not a separate step to undo.
                  if (tr.docChanged) view.dispatch(tr.setMeta('addToHistory', false));
                });
              }
            },
          };
        },
      }),
    ];
  },
});
