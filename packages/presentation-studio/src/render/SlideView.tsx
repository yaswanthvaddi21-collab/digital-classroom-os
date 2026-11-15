import { useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { fitPicture } from '../geometry';
import type { PresentationImageHost } from '../hosts';
import { cssFontFamily, resolveColor, resolveFont } from '../themes';
import type {
  Background,
  ChartElement,
  DiagramElement,
  Fill,
  ImageElement,
  Line,
  PresentationContent,
  PresentationTheme,
  ShapeElement,
  Slide,
  SlideElement,
  TableElement,
  TextElement,
  TextStyle,
} from '../types';
import { ChartSvg } from '../elements/ChartSvg';
import { useAttachmentUrl } from './attachments';
import { RichText } from './RichText';
import { isLinePreset, shapePath, shapeTextBox } from './shapePaths';

const PT = 96 / 72;

/** The background a slide shows: its own, else its layout's, else its master's. */
export function effectiveBackground(content: PresentationContent, slide: Slide): Background {
  const layout = content.layouts.find((l) => l.id === slide.layoutId);
  const master = content.masters.find((m) => m.id === layout?.masterId) ?? content.masters[0];
  return slide.background ?? layout?.background ?? master?.background ?? { type: 'solid', color: { theme: 'light1' } };
}

/** The decorations drawn behind a slide's own objects: the master's (unless its layout hides them), then the layout's. */
export function decorationsOf(content: PresentationContent, slide: Slide): SlideElement[] {
  const layout = content.layouts.find((l) => l.id === slide.layoutId);
  if (!layout) return [];
  const master = content.masters.find((m) => m.id === layout.masterId);
  return [...(layout.showMasterDecorations && master ? master.decorations : []), ...layout.decorations];
}

function hexWithOpacity(hex: string, opacity = 1): string {
  if (opacity >= 1) return hex;
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${Math.max(0, opacity)})`;
}

/** CSS for a fill used as a box background (slides, text boxes). Image fills need the picture's URL. */
function cssFill(fill: Fill | undefined, theme: PresentationTheme, imageUrl?: string): CSSProperties {
  if (!fill || fill.type === 'none') return {};
  if (fill.type === 'solid') return { backgroundColor: hexWithOpacity(resolveColor(fill.color, theme), fill.opacity) };
  if (fill.type === 'gradient') {
    const stops = [...fill.stops].sort((a, b) => a.position - b.position).map((s) => `${resolveColor(s.color, theme)} ${Math.round(s.position * 100)}%`);
    // OOXML 0° runs left to right; CSS 90deg does.
    return { backgroundImage: `linear-gradient(${fill.angle + 90}deg, ${stops.join(', ')})` };
  }
  if (!imageUrl) return { backgroundColor: theme.colors.light2 };
  return {
    backgroundImage: `url("${imageUrl}")`,
    backgroundSize: fill.fit === 'stretch' ? '100% 100%' : fill.fit,
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
  };
}

/** CSS for a text box's text area (font, colour, alignment, padding and vertical alignment). */
export function textCss(style: TextStyle, theme: PresentationTheme): CSSProperties {
  const [t, r, b, l] = style.padding;
  return {
    fontFamily: cssFontFamily(resolveFont(style.font, theme)),
    fontSize: `${style.fontSize * PT}px`,
    color: resolveColor(style.color, theme),
    fontWeight: style.bold ? 700 : 400,
    fontStyle: style.italic ? 'italic' : 'normal',
    textAlign: style.align,
    lineHeight: style.lineSpacing,
    padding: `${t}px ${r}px ${b}px ${l}px`,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: style.verticalAlign === 'middle' ? 'center' : style.verticalAlign === 'bottom' ? 'flex-end' : 'flex-start',
    overflowWrap: 'break-word',
    // 'shrink' scales the text down to fit (useShrinkToFit); 'resize' boxes are kept as tall as their text by the editor.
    overflow: style.autofit === 'none' ? 'visible' : 'hidden',
  };
}

const box = (el: SlideElement): CSSProperties => ({
  position: 'absolute',
  left: el.x,
  top: el.y,
  width: el.w,
  height: el.h,
  ...(el.rotation ? { transform: `rotate(${el.rotation}deg)` } : {}),
});

function borderCss(line: Line | null | undefined, theme: PresentationTheme): CSSProperties {
  if (!line) return {};
  return { border: `${Math.max(line.width * PT, 0)}px ${line.dash === 'solid' ? 'solid' : line.dash === 'dot' ? 'dotted' : 'dashed'} ${resolveColor(line.color, theme)}` };
}

/**
 * 'Shrink text on overflow': the scale (at most 1) at which the text fits the box. The text is laid out wider by the
 * same factor before it is scaled, so it wraps as it would at the smaller size (PowerPoint's normAutofit fontScale).
 * Without layout (tests) it stays 1.
 */
export function useShrinkToFit(enabled: boolean, deps: unknown[]) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ scale: 1, height: 0 });
  useLayoutEffect(() => {
    if (!enabled) {
      setFit({ scale: 1, height: 0 });
      return;
    }
    const box = outer.current;
    const text = inner.current;
    if (!box || !text) return;
    const cs = getComputedStyle(box);
    const available = box.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0);
    if (!(available > 0)) return;
    const saved = { width: text.style.width, transform: text.style.transform, marginBottom: text.style.marginBottom };
    text.style.transform = '';
    text.style.marginBottom = '';
    let s = 1;
    let height = 0;
    for (let i = 0; i < 6; i++) {
      text.style.width = `${100 / s}%`;
      height = text.scrollHeight;
      if (height * s <= available + 0.5) break;
      s = Math.max(0.25, Math.min(s - 0.02, available / height));
    }
    Object.assign(text.style, saved);
    setFit((f) => (f.scale === s && f.height === height ? f : { scale: s, height }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps]);
  // Transforms do not change layout, so the unscaled height is taken back out for vertical alignment.
  const style: CSSProperties = fit.scale < 1 ? { width: `${100 / fit.scale}%`, transform: `scale(${fit.scale})`, transformOrigin: '0 0', marginBottom: -fit.height * (1 - fit.scale), flexShrink: 0 } : {};
  return { outer, inner, style, scale: fit.scale };
}

function TextView({ el, theme, imageHost }: { el: TextElement; theme: PresentationTheme; imageHost?: PresentationImageHost }) {
  const pic = useAttachmentUrl(imageHost, el.fill?.type === 'image' ? el.fill.attachmentId : undefined);
  const fit = useShrinkToFit(el.style.autofit === 'shrink', [el.text, el.style, el.w, el.h, theme]);
  return (
    <div data-element={el.id} style={{ ...box(el), ...cssFill(el.fill, theme, pic.state === 'ready' ? pic.url : undefined), ...borderCss(el.line, theme), boxSizing: 'border-box' }}>
      <div ref={fit.outer} style={{ ...textCss(el.style, theme), width: '100%', height: '100%', boxSizing: 'border-box' }}>
        <div ref={fit.inner} style={fit.style}>
          <RichText doc={el.text} theme={theme} links={false} />
        </div>
      </div>
    </div>
  );
}

/** A picture that is not on this device (or not loaded yet): a calm frame with its description, never a broken image. */
function MissingPicture({ label, theme, loading }: { label: string; theme: PresentationTheme; loading: boolean }) {
  return (
    <div
      style={{ width: '100%', height: '100%', boxSizing: 'border-box', border: `1px dashed ${theme.colors.dark2}`, color: theme.colors.dark2, background: theme.colors.light2, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', fontSize: 14, fontFamily: cssFontFamily(theme.fonts.body), padding: 8, overflow: 'hidden' }}
    >
      {loading ? '' : label}
    </div>
  );
}

function ImageView({ el, theme, imageHost }: { el: ImageElement; theme: PresentationTheme; imageHost?: PresentationImageHost }) {
  const pic = useAttachmentUrl(imageHost, el.attachmentId);
  const crop = el.crop ?? { left: 0, top: 0, right: 0, bottom: 0 };
  const visibleW = Math.max(1, el.naturalWidth * (1 - crop.left - crop.right));
  const visibleH = Math.max(1, el.naturalHeight * (1 - crop.top - crop.bottom));
  const placed = fitPicture({ width: visibleW, height: visibleH }, el, el.fit);
  // The whole picture, scaled so its visible (cropped) part lands on `placed`.
  const sx = placed.w / visibleW;
  const sy = placed.h / visibleH;
  return (
    <div data-element={el.id} style={{ ...box(el), overflow: 'hidden' }}>
      {pic.state === 'ready' ? (
        <img
          src={pic.url}
          alt={el.alt}
          draggable={false}
          style={{ position: 'absolute', left: placed.x - el.naturalWidth * crop.left * sx, top: placed.y - el.naturalHeight * crop.top * sy, width: el.naturalWidth * sx, height: el.naturalHeight * sy, maxWidth: 'none' }}
        />
      ) : (
        <MissingPicture theme={theme} loading={pic.state === 'loading'} label={el.alt ? `Picture not on this device: ${el.alt}` : 'Picture not on this device'} />
      )}
    </div>
  );
}

function dashArray(line: Line): string | undefined {
  const w = Math.max(line.width * PT, 1);
  if (line.dash === 'dash') return `${w * 4} ${w * 3}`;
  if (line.dash === 'dot') return `${w} ${w * 2}`;
  if (line.dash === 'dashDot') return `${w * 4} ${w * 2} ${w} ${w * 2}`;
  return undefined;
}

/**
 * A shape's text. CONTENT: 'shrink' scales it to fit like a text box; 'resize' (the shape grows while its text is
 * typed) shows text that overflows rather than hiding it.
 */
function ShapeText({ el, box: tb, theme }: { el: ShapeElement; box: { x: number; y: number; w: number; h: number }; theme: PresentationTheme }) {
  const style = el.textStyle!;
  const fit = useShrinkToFit(style.autofit === 'shrink', [el.text, style, tb.w, tb.h, theme]);
  return (
    <div ref={fit.outer} style={{ position: 'absolute', left: tb.x, top: tb.y, width: tb.w, height: tb.h, boxSizing: 'border-box', ...textCss(style, theme), ...(style.autofit === 'resize' ? { overflow: 'visible' } : {}) }}>
      <div ref={fit.inner} style={fit.style}>
        <RichText doc={el.text!} theme={theme} links={false} />
      </div>
    </div>
  );
}

function ShapeView({ el, theme, imageHost }: { el: ShapeElement; theme: PresentationTheme; imageHost?: PresentationImageHost }) {
  const uid = useId().replace(/:/g, '');
  const pic = useAttachmentUrl(imageHost, el.fill.type === 'image' ? el.fill.attachmentId : undefined);
  const lineOnly = isLinePreset(el.preset);
  const stroke = el.line ? resolveColor(el.line.color, theme) : 'none';
  const strokeWidth = el.line ? el.line.width * PT : 0;
  let fill = 'none';
  let fillOpacity: number | undefined;
  const defs: ReactNode[] = [];
  if (!lineOnly && el.fill.type === 'solid') {
    fill = resolveColor(el.fill.color, theme);
    fillOpacity = el.fill.opacity;
  } else if (!lineOnly && el.fill.type === 'gradient') {
    fill = `url(#g${uid})`;
    defs.push(
      <linearGradient key="g" id={`g${uid}`} gradientTransform={`rotate(${el.fill.angle} 0.5 0.5)`}>
        {[...el.fill.stops].sort((a, b) => a.position - b.position).map((s, i) => (
          <stop key={i} offset={s.position} stopColor={resolveColor(s.color, theme)} />
        ))}
      </linearGradient>,
    );
  } else if (!lineOnly && el.fill.type === 'image' && pic.state === 'ready') {
    fill = `url(#p${uid})`;
    defs.push(
      <pattern key="p" id={`p${uid}`} patternUnits="userSpaceOnUse" width={el.w} height={el.h}>
        <image href={pic.url} width={el.w} height={el.h} preserveAspectRatio={el.fill.fit === 'stretch' ? 'none' : el.fill.fit === 'cover' ? 'xMidYMid slice' : 'xMidYMid meet'} />
      </pattern>,
    );
  }
  const marker = (end: 'head' | 'tail') => {
    const kind = el.line && (end === 'head' ? el.line.headEnd : el.line.tailEnd);
    if (!kind || kind === 'none') return undefined;
    const id = `m${end}${uid}`;
    defs.push(
      <marker key={id} id={id} viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
        {kind === 'oval' ? <circle cx="5" cy="5" r="4" fill={stroke} /> : kind === 'triangle' ? <path d="M0,0 L10,5 L0,10 Z" fill={stroke} /> : <path d="M0,0 L10,5 L0,10" fill="none" stroke={stroke} strokeWidth="2" />}
      </marker>
    );
    return `url(#${id})`;
  };
  const start = lineOnly ? marker('head') : undefined;
  const end = lineOnly ? marker('tail') : undefined;
  const flip = `${el.flipH ? `translate(${el.w} 0) scale(-1 1)` : ''} ${el.flipV ? `translate(0 ${el.h}) scale(1 -1)` : ''}`.trim();
  const textBox = shapeTextBox(el.preset, el.w, el.h);
  return (
    <div data-element={el.id} style={box(el)}>
      {/* No viewBox: user units are slide pixels. A zero width or height (a straight line) would stop the browser from
          drawing the SVG at all, so the canvas is at least 1 px and the outline overflows it. */}
      <svg width={Math.max(el.w, 1)} height={Math.max(el.h, 1)} overflow="visible" style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }} aria-hidden="true">
        {defs.length > 0 && <defs>{defs}</defs>}
        <path
          d={shapePath(el.preset, el.w, el.h)}
          transform={flip || undefined}
          fill={fill}
          fillOpacity={fillOpacity}
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeDasharray={el.line ? dashArray(el.line) : undefined}
          strokeLinejoin="round"
          markerStart={start}
          markerEnd={end}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {!lineOnly && el.text && el.textStyle && <ShapeText el={el} box={textBox} theme={theme} />}
    </div>
  );
}

function TableView({ el, theme }: { el: TableElement; theme: PresentationTheme }) {
  const s = el.style;
  const border = s.border ? `${s.border.width * PT}px solid ${resolveColor(s.border.color, theme)}` : 'none';
  return (
    <div data-element={el.id} style={{ ...box(el), overflow: 'hidden' }}>
      <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', width: el.columns.reduce((a, b) => a + b, 0) }}>
        <colgroup>
          {el.columns.map((w, i) => (
            <col key={i} style={{ width: w }} />
          ))}
        </colgroup>
        <tbody>
          {el.rows.map((row, r) => {
            const header = s.headerRow && r === 0;
            const band = s.bandedRows && !header && (r - (s.headerRow ? 1 : 0)) % 2 === 1;
            return (
              <tr key={r} style={{ height: row.height }}>
                {row.cells.map((cell, c) => {
                  if (cell.merged) return null;
                  const first = s.firstColumn && c === 0;
                  const background = resolveColor(cell.fill ?? (header ? s.headerFill : band ? s.bandFill : s.fill), theme);
                  const sides = cell.borders;
                  const side = (l: Line | null | undefined) => (l === undefined ? border : l === null ? 'none' : `${l.width * PT}px solid ${resolveColor(l.color, theme)}`);
                  return (
                    <td
                      key={c}
                      colSpan={cell.colSpan}
                      rowSpan={cell.rowSpan}
                      style={{
                        ...textCss(s.text, theme),
                        display: 'table-cell',
                        background,
                        borderTop: side(sides?.top),
                        borderRight: side(sides?.right),
                        borderBottom: side(sides?.bottom),
                        borderLeft: side(sides?.left),
                        verticalAlign: cell.verticalAlign === 'middle' ? 'middle' : cell.verticalAlign ?? 'top',
                        textAlign: cell.align ?? s.text.align,
                        fontWeight: header || first || s.text.bold ? 700 : 400,
                        color: header ? resolveColor(s.headerTextColor, theme) : resolveColor(s.text.color, theme),
                        overflow: 'hidden',
                      }}
                    >
                      <RichText doc={cell.text} theme={theme} links={false} />
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** CONTENT (Round 2b): the chart drawn from its data by the hand-written SVG renderer (elements/chart.ts). */
function ChartView({ el, theme }: { el: ChartElement; theme: PresentationTheme }) {
  return (
    <div data-element={el.id} style={box(el)}>
      <ChartSvg el={el} theme={theme} />
    </div>
  );
}

function DiagramView({ el, theme, imageHost }: { el: DiagramElement; theme: PresentationTheme; imageHost?: PresentationImageHost }) {
  const pic = useAttachmentUrl(imageHost, el.previewId || undefined);
  const label = (el.alt ?? '').trim() || el.title.trim() || 'Diagram';
  return (
    <div data-element={el.id} style={{ ...box(el), overflow: 'hidden' }}>
      {pic.state === 'ready' ? (
        <img src={pic.url} alt={label} draggable={false} style={{ width: '100%', height: '100%', objectFit: 'contain', maxWidth: 'none' }} />
      ) : (
        <MissingPicture theme={theme} loading={pic.state === 'loading'} label={`Diagram: ${label}`} />
      )}
    </div>
  );
}

export function ElementView({ el, theme, imageHost }: { el: SlideElement; theme: PresentationTheme; imageHost?: PresentationImageHost }) {
  switch (el.type) {
    case 'text':
      return <TextView el={el} theme={theme} imageHost={imageHost} />;
    case 'image':
      return <ImageView el={el} theme={theme} imageHost={imageHost} />;
    case 'shape':
      return <ShapeView el={el} theme={theme} imageHost={imageHost} />;
    case 'table':
      return <TableView el={el} theme={theme} />;
    case 'chart':
      return <ChartView el={el} theme={theme} />;
    case 'diagram':
      return <DiagramView el={el} theme={theme} imageHost={imageHost} />;
  }
}

export interface SlideViewProps {
  content: PresentationContent;
  slide: Slide;
  /** Rendered size = slide size × scale. */
  scale: number;
  imageHost?: PresentationImageHost;
  /** Accessible name of the slide picture (role img). Without one the slide is decorative (a thumbnail in a labelled option). */
  label?: string;
}

/**
 * One slide, read-only, as it appears in the slide show and in exports: background, master and layout decorations,
 * then the slide's objects in order. Placeholder prompts are never drawn here (they belong to the editor only).
 */
export function SlideView({ content, slide, scale, imageHost, label }: SlideViewProps) {
  const { width, height } = content.size;
  const theme = content.theme;
  const background = effectiveBackground(content, slide);
  const bgPicture = useAttachmentUrl(imageHost, background.type === 'image' ? background.attachmentId : undefined);
  return (
    <div {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })} data-slide={slide.id} style={{ width: width * scale, height: height * scale, overflow: 'hidden', position: 'relative', flexShrink: 0 }}>
      <div style={{ width, height, transform: `scale(${scale})`, transformOrigin: '0 0', position: 'absolute', left: 0, top: 0, ...cssFill(background, theme, bgPicture.state === 'ready' ? bgPicture.url : undefined) }}>
        {decorationsOf(content, slide).map((el) => (
          <ElementView key={`d-${el.id}`} el={el} theme={theme} imageHost={imageHost} />
        ))}
        {slide.elements.map((el) => (
          <ElementView key={el.id} el={el} theme={theme} imageHost={imageHost} />
        ))}
      </div>
    </div>
  );
}
