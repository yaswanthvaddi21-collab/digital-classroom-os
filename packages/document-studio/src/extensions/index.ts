import type { AnyExtension } from '@tiptap/core';
import Highlight from '@tiptap/extension-highlight';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import { TableKit } from '@tiptap/extension-table';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyleKit } from '@tiptap/extension-text-style';
import { CharacterCount, Placeholder } from '@tiptap/extensions';
import StarterKit from '@tiptap/starter-kit';
import { DiagramEmbed, type DiagramHost } from './diagramEmbed';
import { DiagramClipboard } from './diagramClipboard'; // Phase 6 CLIPBOARD
import { PageBreak } from './pageBreak';
import { RemoteImages } from './remoteImages';
import { SearchReplace } from './searchReplace';
import { SectionBreak } from './sectionBreak';
import { TableOfContents } from './tableOfContents';
import { Equations } from './equation'; // G-INSERT
import { FigureImage } from './figureImage'; // G-INSERT
import { Shape } from './shape'; // G-INSERT
import { TextBox } from './textBox'; // G-INSERT
import { CommentMark } from '../review/commentMark'; // G-REVIEW
import { ListStyles } from './listStyles'; // G-FORMAT
import { ParagraphFormat } from './paragraphFormat'; // G-FORMAT

/** Every extension the document schema uses. Content saved with these must keep loading, so only add, never remove. */
export function documentExtensions(
  opts: {
    placeholder?: string;
    diagramHost?: DiagramHost | null;
    /** Stores pasted web images in the document (see RemoteImages). */
    inlineRemoteImage?: ((src: string) => Promise<string | null>) | null;
  } = {},
): AnyExtension[] {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4] },
      link: { openOnClick: false, autolink: true, defaultProtocol: 'https' },
    }),
    TextStyleKit,
    Highlight.configure({ multicolor: true }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    TableKit.configure({ table: { resizable: true } }),
    // G-INSERT: pictures gain alignment and a caption (null by default, so existing pictures are unchanged).
    FigureImage.configure({ allowBase64: true, resize: { enabled: true, alwaysPreserveAspectRatio: true, minWidth: 40, minHeight: 40 } }),
    Subscript,
    Superscript,
    CharacterCount,
    Placeholder.configure({ placeholder: opts.placeholder ?? 'Start writing…' }),
    PageBreak,
    TableOfContents,
    SearchReplace,
    // Schema 2 (Release 0.2.x): editable diagrams embedded in documents.
    DiagramEmbed.configure({ host: opts.diagramHost ?? null }),
    // Release 0.2.x: pasted web images are stored in the document or visibly marked (no schema change).
    RemoteImages.configure({ inline: opts.inlineRemoteImage ?? null }),
    // G-FORMAT (schema 2): line spacing, paragraph spacing, indents, Title/Subtitle/Caption; bullet glyphs and number formats.
    ParagraphFormat,
    ListStyles,
    // G-REVIEW (schema 2): the comment mark (threads are stored in the document's `comments` field).
    CommentMark,
    // @phase4:extensions — add new extensions here. Anything they store beyond v0.1.0 must make schemaFor() return 2
    // (automatic for new node/mark types and non-default attributes; see compat.ts).
    // G-INSERT (schema 2): equations (inlineMath, blockMath), shapes and text boxes.
    Equations,
    Shape,
    TextBox,
    // G-LAYOUT: section breaks (a new node type, so schema 2).
    SectionBreak,
    // @phase6:CLIPBOARD — DiagramClipboard (extensions/diagramClipboard.ts): paste of Diagram Studio shapes, copy as
    // '[Diagram: title]' plus the preview <img> for other apps. Anything stored beyond V020_VOCABULARY makes schemaFor()
    // return 3 (compat.ts, ADR 0013). It adds no node, mark or attribute, so the content schema is unchanged.
    DiagramClipboard.configure({ host: opts.diagramHost ?? null }),
  ];
}

export { DiagramEmbed, PageBreak, RemoteImages, SearchReplace, TableOfContents };
export { countRemoteImages, isRemoteImageSrc, REMOTE_IMAGE_LABEL } from './remoteImages';
export * from './diagramEmbed';
export { DiagramClipboard, diagramClipboardText, holdsShapes, SHAPES_CLIPBOARD_FORMAT, SHAPES_CLIPBOARD_HTML_ATTR, SHAPES_CLIPBOARD_MIME } from './diagramClipboard'; // Phase 6 CLIPBOARD
export * from './searchReplace';
export { collectHeadings } from './tableOfContents';
export * from './paragraphFormat'; // G-FORMAT
export * from './listStyles'; // G-FORMAT
