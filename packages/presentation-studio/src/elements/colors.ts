import { isHexColor, resolveColor } from '../themes';
import { THEME_COLOR_SLOTS, type Color, type PresentationTheme, type ThemeColorSlot } from '../types';
import { STANDARD_COLORS } from '../ui/parts';

/** Names of the theme colour slots as the colour pickers show them. */
export const SLOT_LABELS: Readonly<Record<ThemeColorSlot, string>> = {
  dark1: 'Text',
  light1: 'Background',
  dark2: 'Text 2',
  light2: 'Background 2',
  accent1: 'Accent 1',
  accent2: 'Accent 2',
  accent3: 'Accent 3',
  accent4: 'Accent 4',
  accent5: 'Accent 5',
  accent6: 'Accent 6',
  hyperlink: 'Link',
};

/** Names of the standard colours (ui/parts STANDARD_COLORS, in order). */
const STANDARD_NAMES = ['Black', 'White', 'Dark red', 'Red', 'Orange', 'Yellow', 'Light green', 'Green', 'Light blue', 'Blue', 'Dark blue', 'Purple', 'Grey', 'Light grey', 'Dark orange', 'Teal'];

/** A colour as a string key for selects: 'theme:accent1' or '#rrggbb'. */
export const colorKey = (c: Color): string => (typeof c === 'string' ? c.toLowerCase() : `theme:${c.theme}`);

/** The colour a key stands for, or null for an unreadable key. */
export function parseColorKey(key: string): Color | null {
  if (key.startsWith('theme:')) {
    const slot = key.slice(6) as ThemeColorSlot;
    return THEME_COLOR_SLOTS.includes(slot) ? { theme: slot } : null;
  }
  return isHexColor(key) ? key.toLowerCase() : null;
}

/** The theme's colours (they follow a theme change), then the standard colours. */
export function colorOptions(theme: PresentationTheme): Array<{ key: string; label: string; color: Color; css: string }> {
  return [
    ...THEME_COLOR_SLOTS.filter((s) => s !== 'hyperlink').map((slot) => ({ key: `theme:${slot}`, label: `${SLOT_LABELS[slot]} (theme)`, color: { theme: slot } as Color, css: resolveColor({ theme: slot }, theme) })),
    ...STANDARD_COLORS.map((hex, i) => ({ key: hex, label: STANDARD_NAMES[i] ?? hex, color: hex as Color, css: hex })),
  ];
}
