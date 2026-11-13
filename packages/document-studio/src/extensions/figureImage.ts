import Image from '@tiptap/extension-image';
import type { NodeViewRenderer } from '@tiptap/core';
import type { NodeView } from '@tiptap/pm/view';
import { ALIGNMENTS, safeChoice, type Alignment } from './objectAttrs';

/** A picture's alignment on the page ('center' when none is stored, as before alignment existed). */
export const imageAlign = (attrs: Record<string, unknown> | undefined): Alignment => safeChoice(attrs?.align, ALIGNMENTS, 'center');
/** A picture's caption text, or '' when it has none. */
export const imageCaption = (attrs: Record<string, unknown> | undefined): string => (typeof attrs?.caption === 'string' ? attrs.caption.trim() : '');

/**
 * Pictures, with alignment (left, centre, right) and a caption below the picture. Both are new attributes with a
 * null default, so pictures without them are stored exactly as before (and stay content schema 1). They travel
 * through copy and paste as data-align and data-caption on the <img>.
 *
 * On screen (and in print, which copies the screen) the picture's resizable view is wrapped in a <figure> with a
 * <figcaption>.
 */
export const FigureImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      align: {
        default: null,
        parseHTML: (el: HTMLElement) => {
          const v = el.getAttribute('data-align');
          return v && (ALIGNMENTS as readonly string[]).includes(v) ? v : null;
        },
        renderHTML: (attrs: Record<string, unknown>) => (attrs.align ? { 'data-align': String(attrs.align) } : {}),
      },
      caption: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-caption') || null,
        renderHTML: (attrs: Record<string, unknown>) => (attrs.caption ? { 'data-caption': String(attrs.caption) } : {}),
      },
    };
  },

  addNodeView() {
    const inner = this.parent?.() as NodeViewRenderer | null | undefined;
    if (!inner) return null;
    const type = this.name;
    return ((props) => {
      const picture = inner(props) as NodeView;
      const figure = document.createElement('figure');
      figure.className = 'dcos-figure';
      figure.appendChild(picture.dom);
      const caption = document.createElement('figcaption');
      caption.className = 'dcos-figcaption';
      const show = (attrs: Record<string, unknown>) => {
        figure.dataset.align = imageAlign(attrs);
        const text = imageCaption(attrs);
        caption.textContent = text;
        if (text && caption.parentNode !== figure) figure.appendChild(caption);
        if (!text && caption.parentNode === figure) caption.remove();
      };
      show(props.node.attrs);
      return {
        dom: figure,
        update: (next, decos, innerDecos) => {
          if (next.type.name !== type) return false;
          const ok = picture.update ? picture.update(next, decos, innerDecos) : false;
          if (ok) show(next.attrs);
          return ok;
        },
        destroy: () => picture.destroy?.(),
      } satisfies NodeView;
    }) as NodeViewRenderer;
  },
});
