import type { Color, FontRef, PresentationTheme, ThemeColorSlot, ThemeFonts } from './types';

/**
 * Built-in themes. Colour slots follow OOXML themes with the default colour map: `light1` is the slide background
 * (bg1) and `dark1` the text colour (tx1), also in dark themes, so a theme maps to PPTX one to one.
 *
 * Fonts are ones that ship with Windows, macOS, iOS and Android or have a close metric match there, so nothing is
 * downloaded (the app works offline) and exported files look the same in PowerPoint and Keynote.
 */
const theme = (id: string, name: string, colors: Record<ThemeColorSlot, string>, fonts: ThemeFonts): PresentationTheme => ({ id, name, colors, fonts });

export const THEMES: readonly PresentationTheme[] = [
  theme(
    'classroom',
    'Classroom',
    { dark1: '#1f2937', light1: '#ffffff', dark2: '#1e3a5f', light2: '#e8eef5', accent1: '#2563eb', accent2: '#16a34a', accent3: '#f59e0b', accent4: '#dc2626', accent5: '#7c3aed', accent6: '#0891b2', hyperlink: '#2563eb' },
    { heading: 'Arial', body: 'Arial' },
  ),
  theme(
    'chalkboard',
    'Chalkboard',
    { dark1: '#f8fafc', light1: '#1f3b30', dark2: '#fde68a', light2: '#2d5243', accent1: '#fde68a', accent2: '#93c5fd', accent3: '#fca5a5', accent4: '#86efac', accent5: '#f9a8d4', accent6: '#fdba74', hyperlink: '#93c5fd' },
    { heading: 'Georgia', body: 'Verdana' },
  ),
  theme(
    'midnight',
    'Midnight',
    { dark1: '#e2e8f0', light1: '#0f172a', dark2: '#38bdf8', light2: '#1e293b', accent1: '#38bdf8', accent2: '#a78bfa', accent3: '#34d399', accent4: '#fbbf24', accent5: '#f472b6', accent6: '#fb7185', hyperlink: '#7dd3fc' },
    { heading: 'Trebuchet MS', body: 'Trebuchet MS' },
  ),
  theme(
    'paper',
    'Paper',
    { dark1: '#3f3a34', light1: '#fbf7ef', dark2: '#7c2d12', light2: '#f1e7d6', accent1: '#b45309', accent2: '#15803d', accent3: '#1d4ed8', accent4: '#9f1239', accent5: '#6d28d9', accent6: '#0f766e', hyperlink: '#1d4ed8' },
    { heading: 'Georgia', body: 'Georgia' },
  ),
  theme(
    'sunrise',
    'Sunrise',
    { dark1: '#27272a', light1: '#ffffff', dark2: '#c2410c', light2: '#fff3e6', accent1: '#ea580c', accent2: '#db2777', accent3: '#ca8a04', accent4: '#0284c7', accent5: '#16a34a', accent6: '#7c3aed', hyperlink: '#0284c7' },
    { heading: 'Verdana', body: 'Verdana' },
  ),
  theme(
    'contrast',
    'High contrast',
    { dark1: '#000000', light1: '#ffffff', dark2: '#000000', light2: '#f2f2f2', accent1: '#0047ab', accent2: '#b00020', accent3: '#006400', accent4: '#7a4a00', accent5: '#4b0082', accent6: '#005f73', hyperlink: '#0000ee' },
    { heading: 'Arial', body: 'Arial' },
  ),
];

export const DEFAULT_THEME_ID = 'classroom';

/** A built-in theme by id (a copy, so callers may change it), or undefined. */
export function themeById(id: string): PresentationTheme | undefined {
  const t = THEMES.find((x) => x.id === id);
  return t && structuredCloneTheme(t);
}

const structuredCloneTheme = (t: PresentationTheme): PresentationTheme => ({ ...t, colors: { ...t.colors }, fonts: { ...t.fonts } });

const HEX = /^#[0-9a-f]{6}$/i;
/** Whether a stored colour string is '#rrggbb'. */
export const isHexColor = (v: unknown): v is string => typeof v === 'string' && HEX.test(v);

/** The '#rrggbb' a colour stands for in `theme`. Anything unreadable gives `fallback`. */
export function resolveColor(color: Color | undefined, theme: PresentationTheme, fallback = '#000000'): string {
  if (typeof color === 'string') return isHexColor(color) ? color.toLowerCase() : fallback;
  if (color && typeof color === 'object' && typeof color.theme === 'string') {
    const v = theme.colors[color.theme];
    return isHexColor(v) ? v.toLowerCase() : fallback;
  }
  return fallback;
}

/** The font family name a font reference stands for in `theme`. */
export function resolveFont(font: FontRef | undefined, theme: PresentationTheme): string {
  if (font === 'heading') return theme.fonts.heading;
  if (font === 'body' || !font) return theme.fonts.body;
  return font;
}

/** A CSS font-family value for a font name, with a generic fallback (serif fonts fall back to serif). */
export function cssFontFamily(name: string): string {
  const serif = /georgia|times|garamond|cambria|palatino|serif/i.test(name) && !/sans/i.test(name);
  const mono = /courier|mono|consolas/i.test(name);
  const generic = mono ? 'monospace' : serif ? 'serif' : 'sans-serif';
  return `"${name.replace(/["\\]/g, '')}", ${generic}`;
}
