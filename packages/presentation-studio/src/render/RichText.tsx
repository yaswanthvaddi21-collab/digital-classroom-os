import type { CSSProperties, ReactNode } from 'react';
import { cssFontFamily, resolveColor } from '../themes';
import type { PresentationTheme, RichBlock, RichInline, RichListItem, RichMark, RichTextDoc } from '../types';

/** Only these link targets are followed; anything else (javascript:, data:, …) is shown as plain text. */
export function safeHref(href: unknown): string | null {
  if (typeof href !== 'string') return null;
  try {
    // Absolute links only: a relative one would point into the app itself.
    return ['http:', 'https:', 'mailto:'].includes(new URL(href).protocol) ? href : null;
  } catch {
    return null;
  }
}

const PT_TO_PX = 96 / 72;

/** `24pt` (or a bare number of points) as pixels on the slide; null when unreadable. */
export function fontSizePx(value: unknown): number | null {
  const m = typeof value === 'string' ? /^(\d+(?:\.\d+)?)(pt)?$/.exec(value.trim()) : typeof value === 'number' ? [String(value), String(value)] : null;
  const pt = m ? Number(m[1]) : NaN;
  return Number.isFinite(pt) && pt > 0 && pt < 1000 ? pt * PT_TO_PX : null;
}

/** How rich text is drawn: the theme, and whether links are live (`false`: drawn as link-coloured, underlined text). */
interface RenderOptions {
  theme: PresentationTheme;
  links: boolean;
}

function withMark(child: ReactNode, mark: RichMark, key: number, { theme, links }: RenderOptions): ReactNode {
  switch (mark.type) {
    case 'bold':
      return <strong key={key}>{child}</strong>;
    case 'italic':
      return <em key={key}>{child}</em>;
    case 'underline':
      return <u key={key}>{child}</u>;
    case 'strike':
      return <s key={key}>{child}</s>;
    case 'subscript':
      return <sub key={key}>{child}</sub>;
    case 'superscript':
      return <sup key={key}>{child}</sup>;
    case 'link': {
      const href = safeHref(mark.attrs?.href);
      if (href && !links)
        return (
          <span key={key} style={{ color: theme.colors.hyperlink, textDecoration: 'underline' }}>
            {child}
          </span>
        );
      return href ? (
        <a key={key} href={href} target="_blank" rel="noopener noreferrer" style={{ color: theme.colors.hyperlink }}>
          {child}
        </a>
      ) : (
        child
      );
    }
    case 'highlight':
      return (
        <mark key={key} style={{ backgroundColor: resolveColor(mark.attrs?.color ?? undefined, theme, '#fef08a'), color: 'inherit' }}>
          {child}
        </mark>
      );
    case 'textStyle': {
      const style: CSSProperties = {};
      if (mark.attrs?.color) style.color = resolveColor(mark.attrs.color, theme, 'inherit');
      if (mark.attrs?.fontFamily) style.fontFamily = cssFontFamily(mark.attrs.fontFamily);
      const size = fontSizePx(mark.attrs?.fontSize);
      if (size) style.fontSize = `${size}px`;
      return Object.keys(style).length ? (
        <span key={key} style={style}>
          {child}
        </span>
      ) : (
        child
      );
    }
    default:
      return child;
  }
}

function inline(nodes: RichInline[] | undefined, o: RenderOptions): ReactNode[] {
  return (nodes ?? []).map((n, i) => {
    if (n.type === 'hardBreak') return <br key={i} />;
    let out: ReactNode = n.text;
    (n.marks ?? []).forEach((m, j) => {
      out = withMark(out, m, j, o);
    });
    return <span key={i}>{out}</span>;
  });
}

function block(b: RichBlock | RichListItem, key: number, o: RenderOptions): ReactNode {
  switch (b.type) {
    case 'paragraph': {
      const align = b.attrs?.textAlign;
      const content = inline(b.content, o);
      // An empty paragraph keeps its line, as in the editor.
      return (
        <p key={key} style={{ margin: 0, ...(align ? { textAlign: align } : {}) }}>
          {content.length ? content : <br />}
        </p>
      );
    }
    case 'bulletList':
      return (
        <ul key={key} style={{ margin: 0, paddingLeft: '1.2em', listStyleType: 'disc' }}>
          {b.content.map((c, i) => block(c, i, o))}
        </ul>
      );
    case 'orderedList':
      return (
        <ol key={key} start={b.attrs?.start ?? 1} style={{ margin: 0, paddingLeft: '1.4em', listStyleType: 'decimal' }}>
          {b.content.map((c, i) => block(c, i, o))}
        </ol>
      );
    case 'listItem':
      return <li key={key}>{b.content.map((c, i) => block(c, i, o))}</li>;
    default:
      return null;
  }
}

/**
 * Read-only rendering of slide rich text (the frozen schema-1 vocabulary). With `links={false}` (slides drawn as a
 * picture: thumbnails and the stage, which are role="img" or aria-hidden) links are drawn as text, so nothing focusable
 * or clickable sits inside a picture or a slide-list button.
 */
export function RichText({ doc, theme, links = true }: { doc: RichTextDoc; theme: PresentationTheme; links?: boolean }) {
  const o = { theme, links };
  return <>{doc.content.map((b, i) => block(b, i, o))}</>;
}
