import type { LayoutKind, Placeholder, PlaceholderKind, PresentationSize, SlideLayout, SlideMaster, TextAlign, TextStyle, VerticalAlign } from './types';

/** The built-in master's id, and each built-in layout's id (`layout-<kind>`). Stable: slides refer to them. */
export const DEFAULT_MASTER_ID = 'master-1';
export const layoutIdFor = (kind: LayoutKind) => `layout-${kind}`;

export const LAYOUT_NAMES: Readonly<Record<LayoutKind, string>> = {
  title: 'Title slide',
  titleContent: 'Title and content',
  twoContent: 'Two content',
  sectionHeader: 'Section header',
  titleOnly: 'Title only',
  blank: 'Blank',
  comparison: 'Comparison',
  pictureCaption: 'Picture with caption',
};

/** A text style; everything not given follows the body text defaults. */
export function textStyle(overrides: Partial<TextStyle> = {}): TextStyle {
  return {
    font: 'body',
    fontSize: 20,
    color: { theme: 'dark1' },
    bold: false,
    italic: false,
    align: 'left',
    verticalAlign: 'top',
    autofit: 'shrink',
    lineSpacing: 1.15,
    padding: [6, 10, 6, 10],
    ...overrides,
  };
}

const titleStyle = (fontSize: number, align: TextAlign = 'left', verticalAlign: VerticalAlign = 'middle') =>
  textStyle({ font: 'heading', fontSize, bold: true, align, verticalAlign, lineSpacing: 1.0 });

const PROMPTS: Readonly<Record<PlaceholderKind, string>> = {
  title: 'Click to add title',
  subtitle: 'Click to add subtitle',
  body: 'Click to add text',
  picture: 'Click the icon to add a picture',
  chart: 'Click the icon to add a chart',
  table: 'Click the icon to add a table',
  footer: 'Footer',
  date: 'Date',
  slideNumber: '#',
};

function ph(id: string, kind: PlaceholderKind, box: [number, number, number, number], style: TextStyle, prompt = PROMPTS[kind]): Placeholder {
  const [x, y, w, h] = box.map((v) => Math.round(v));
  return { id, kind, x, y, w, h, prompt, style };
}

/** The built-in master: background from the theme, a title and a body placeholder. */
export function createMaster(size: PresentationSize): SlideMaster {
  const { width: W, height: H } = size;
  const m = 48;
  return {
    id: DEFAULT_MASTER_ID,
    name: 'Default',
    background: { type: 'solid', color: { theme: 'light1' } },
    placeholders: [
      ph('title', 'title', [m, 28, W - 2 * m, H * 0.15], titleStyle(32)),
      ph('body', 'body', [m, H * 0.24, W - 2 * m, H * 0.66], textStyle()),
    ],
    decorations: [],
  };
}

/** The eight built-in layouts for a slide size, all on the built-in master. */
export function createLayouts(size: PresentationSize): SlideLayout[] {
  const { width: W, height: H } = size;
  const m = 48;
  const gap = 24;
  const col = (W - 2 * m - gap) / 2;
  const top = H * 0.24;
  const bodyH = H * 0.9 - top;
  const title = ph('title', 'title', [m, 28, W - 2 * m, H * 0.15], titleStyle(32));
  const layout = (kind: LayoutKind, placeholders: Placeholder[]): SlideLayout => ({
    id: layoutIdFor(kind),
    masterId: DEFAULT_MASTER_ID,
    name: LAYOUT_NAMES[kind],
    kind,
    placeholders,
    decorations: [],
    showMasterDecorations: true,
  });
  return [
    layout('title', [
      ph('title', 'title', [m * 1.5, H * 0.28, W - 3 * m, H * 0.24], titleStyle(44, 'center', 'bottom')),
      ph('subtitle', 'subtitle', [m * 1.5, H * 0.55, W - 3 * m, H * 0.16], textStyle({ fontSize: 22, align: 'center', color: { theme: 'dark2' } })),
    ]),
    layout('titleContent', [title, ph('body', 'body', [m, top, W - 2 * m, bodyH], textStyle())]),
    layout('twoContent', [title, ph('left', 'body', [m, top, col, bodyH], textStyle({ fontSize: 18 })), ph('right', 'body', [m + col + gap, top, col, bodyH], textStyle({ fontSize: 18 }))]),
    layout('sectionHeader', [
      ph('title', 'title', [m * 1.5, H * 0.36, W - 3 * m, H * 0.2], titleStyle(40, 'left', 'bottom')),
      ph('body', 'body', [m * 1.5, H * 0.58, W - 3 * m, H * 0.14], textStyle({ fontSize: 18, color: { theme: 'dark2' } })),
    ]),
    layout('titleOnly', [title]),
    layout('blank', []),
    layout('comparison', [
      title,
      ph('leftHeading', 'body', [m, top, col, 44], textStyle({ fontSize: 20, bold: true, verticalAlign: 'bottom' })),
      ph('left', 'body', [m, top + 52, col, bodyH - 52], textStyle({ fontSize: 18 })),
      ph('rightHeading', 'body', [m + col + gap, top, col, 44], textStyle({ fontSize: 20, bold: true, verticalAlign: 'bottom' })),
      ph('right', 'body', [m + col + gap, top + 52, col, bodyH - 52], textStyle({ fontSize: 18 })),
    ]),
    layout('pictureCaption', [
      ph('title', 'title', [m, H * 0.12, W * 0.34, H * 0.2], titleStyle(26, 'left', 'bottom')),
      ph('picture', 'picture', [W * 0.42, m, W * 0.58 - m, H - 2 * m], textStyle({ align: 'center', verticalAlign: 'middle' })),
      ph('caption', 'body', [m, H * 0.35, W * 0.34, H * 0.5], textStyle({ fontSize: 16 })),
    ]),
  ];
}
