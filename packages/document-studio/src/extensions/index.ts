import type { AnyExtension } from '@tiptap/core';
import Highlight from '@tiptap/extension-highlight';
import Image from '@tiptap/extension-image';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import { TableKit } from '@tiptap/extension-table';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyleKit } from '@tiptap/extension-text-style';
import { CharacterCount, Placeholder } from '@tiptap/extensions';
import StarterKit from '@tiptap/starter-kit';
import { DiagramEmbed, type DiagramHost } from './diagramEmbed';
import { PageBreak } from './pageBreak';
import { SearchReplace } from './searchReplace';
import { TableOfContents } from './tableOfContents';

/** Every extension the document schema uses. Content saved with these must keep loading, so only add, never remove. */
export function documentExtensions(opts: { placeholder?: string; diagramHost?: DiagramHost | null } = {}): AnyExtension[] {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4] },
      link: { openOnClick: false, autolink: true, defaultProtocol: 'https' },
    }),
    TextStyleKit,
    Highlight.configure({ multicolor: true }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    TableKit.configure({ table: { resizable: true } }),
    Image.configure({ allowBase64: true, resize: { enabled: true, alwaysPreserveAspectRatio: true, minWidth: 40, minHeight: 40 } }),
    Subscript,
    Superscript,
    CharacterCount,
    Placeholder.configure({ placeholder: opts.placeholder ?? 'Start writing…' }),
    PageBreak,
    TableOfContents,
    SearchReplace,
    // Schema 2 (Release 0.2.x): editable diagrams embedded in documents.
    DiagramEmbed.configure({ host: opts.diagramHost ?? null }),
  ];
}

export { DiagramEmbed, PageBreak, SearchReplace, TableOfContents };
export * from './diagramEmbed';
export * from './searchReplace';
export { collectHeadings } from './tableOfContents';
