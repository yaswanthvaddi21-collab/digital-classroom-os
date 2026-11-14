/** Keyboard movement in the Quick Connect shape palette, a grid of `PALETTE_COLUMNS` columns (diagramCss). Pure. */

export const PALETTE_COLUMNS = 5;

/**
 * The item to focus after `key` from item `index` of `count`: left/right go through the items in order (wrapping),
 * up/down move a row in the same column (wrapping to the other end of that column), Home/End go to the first/last.
 * Null for any other key.
 */
export function paletteMove(index: number, key: string, count: number, columns = PALETTE_COLUMNS): number | null {
  if (count <= 0) return null;
  const i = Math.max(0, Math.min(index, count - 1));
  const col = i % columns;
  const lastRow = Math.floor((count - 1) / columns);
  switch (key) {
    case 'ArrowRight':
      return (i + 1) % count;
    case 'ArrowLeft':
      return (i - 1 + count) % count;
    case 'ArrowDown':
      return i + columns < count ? i + columns : col;
    case 'ArrowUp': {
      if (i - columns >= 0) return i - columns;
      const bottom = lastRow * columns + col;
      return bottom < count ? bottom : bottom - columns;
    }
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}
