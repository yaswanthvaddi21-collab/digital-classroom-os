/**
 * The Tiptap extensions for slide text and speaker notes: exactly the schema-1 rich text vocabulary (compat.ts) and
 * nothing from the document schema, so a document change can never change slide text (audit: reuse, rich text).
 * What an editor hands back is still passed through cleanRichText, which drops the attributes Tiptap adds (link
 * target and rel, list type…) that are not part of the model.
 */
import type { AnyExtension } from '@tiptap/core';
import Highlight from '@tiptap/extension-highlight';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyleKit } from '@tiptap/extension-text-style';
import { Placeholder } from '@tiptap/extensions';
import StarterKit from '@tiptap/starter-kit';

export function slideTextExtensions(placeholder?: string): AnyExtension[] {
  return [
    StarterKit.configure({
      heading: false,
      blockquote: false,
      code: false,
      codeBlock: false,
      horizontalRule: false,
      dropcursor: false,
      gapcursor: false,
      trailingNode: false,
      link: { openOnClick: false, autolink: true, defaultProtocol: 'https' },
    }),
    TextStyleKit.configure({ backgroundColor: false, lineHeight: false }),
    Highlight.configure({ multicolor: true }),
    TextAlign.configure({ types: ['paragraph'] }),
    Subscript,
    Superscript,
    ...(placeholder ? [Placeholder.configure({ placeholder })] : []),
  ];
}

/** CSS the editors need: the prompt of an empty editor, and no focus outline inside a box that is already framed. */
export const EDITOR_CSS = `
.dcos-slide-text .ProseMirror { outline: none; white-space: pre-wrap; word-wrap: break-word; min-height: 1em; }
.dcos-slide-text .ProseMirror p { margin: 0; }
.dcos-slide-text .ProseMirror ul { margin: 0; padding-left: 1.2em; list-style-type: disc; }
.dcos-slide-text .ProseMirror ol { margin: 0; padding-left: 1.4em; list-style-type: decimal; }
.dcos-slide-text .ProseMirror a { color: inherit; text-decoration: underline; }
.dcos-slide-text .ProseMirror p.is-editor-empty:first-child::before { content: attr(data-placeholder); color: #8a8f98; float: left; height: 0; pointer-events: none; }
.dcos-notes .ProseMirror { outline: none; min-height: 100%; white-space: pre-wrap; word-wrap: break-word; }
.dcos-notes .ProseMirror p { margin: 0 0 0.25em; }
.dcos-notes .ProseMirror ul { margin: 0; padding-left: 1.2em; list-style-type: disc; }
.dcos-notes .ProseMirror ol { margin: 0; padding-left: 1.4em; list-style-type: decimal; }
.dcos-notes .ProseMirror a { color: var(--dc-accent, #4f46e5); text-decoration: underline; }
.dcos-notes .ProseMirror p.is-editor-empty:first-child::before { content: attr(data-placeholder); color: #8a8f98; float: left; height: 0; pointer-events: none; }
`;
