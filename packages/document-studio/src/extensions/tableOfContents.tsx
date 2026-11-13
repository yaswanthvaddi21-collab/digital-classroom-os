import { mergeAttributes, Node, type Editor } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from '@tiptap/react';
import { useEffect, useState } from 'react';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    tableOfContents: {
      insertTableOfContents: () => ReturnType;
    };
  }
}

export interface HeadingEntry {
  level: number;
  text: string;
  pos: number;
}

export function collectHeadings(doc: PMNode): HeadingEntry[] {
  const out: HeadingEntry[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === 'heading') {
      const text = node.textContent.trim();
      if (text) out.push({ level: node.attrs.level as number, text, pos });
      return false;
    }
    return true;
  });
  return out;
}

function TocView({ editor, selected }: ReactNodeViewProps) {
  const [headings, setHeadings] = useState(() => collectHeadings(editor.state.doc));
  useEffect(() => {
    const update = ({ editor: e }: { editor: Editor }) => setHeadings(collectHeadings(e.state.doc));
    editor.on('update', update);
    return () => {
      editor.off('update', update);
    };
  }, [editor]);
  return (
    <NodeViewWrapper className={`dcos-toc${selected ? ' is-selected' : ''}`} data-type="table-of-contents" contentEditable={false}>
      <div className="dcos-toc-title">Table of Contents</div>
      {headings.length === 0 ? (
        <div className="dcos-toc-empty">Add headings to your document and they will be listed here.</div>
      ) : (
        <ol>
          {headings.map((h, i) => (
            <li key={`${h.pos}-${i}`} style={{ paddingLeft: `${(h.level - 1) * 1.25}em` }}>
              <button
                type="button"
                onClick={() => editor.chain().focus().setTextSelection(h.pos + 1).scrollIntoView().run()}
              >
                {h.text}
              </button>
            </li>
          ))}
        </ol>
      )}
    </NodeViewWrapper>
  );
}

/** A live table of contents generated from the document's headings. */
export const TableOfContents = Node.create({
  name: 'tableOfContents',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  parseHTML() {
    return [{ tag: 'div[data-type="table-of-contents"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'table-of-contents' })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(TocView);
  },
  addCommands() {
    return {
      insertTableOfContents:
        () =>
        ({ commands }) =>
          commands.insertContent({ type: this.name }),
    };
  },
});
