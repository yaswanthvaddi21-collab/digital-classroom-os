/**
 * Slide show keys (the same in the show and in the presenter window), as in PowerPoint and Keynote. Clickers send
 * PageDown/PageUp (some send B or . for a black screen).
 */
export type ShowKeyAction =
  | { type: 'next' }
  | { type: 'previous' }
  | { type: 'first' }
  | { type: 'last' }
  | { type: 'black' }
  | { type: 'white' }
  | { type: 'end' }
  | { type: 'fullscreen' }
  /** A digit typed towards "number, then Enter" (go to that slide). */
  | { type: 'digit'; digit: number }
  /** Enter: go to the typed number, or next when none was typed. */
  | { type: 'enter' };

/** The action of a key, or null for keys the show leaves alone (with Ctrl, ⌘ or Alt held, every key). */
export function showKeyAction(e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey'>): ShowKeyAction | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  switch (e.key) {
    case 'ArrowRight':
    case 'ArrowDown':
    case ' ':
    case 'PageDown':
    case 'n':
    case 'N':
      return { type: 'next' };
    case 'Enter':
      return { type: 'enter' };
    case 'ArrowLeft':
    case 'ArrowUp':
    case 'PageUp':
    case 'Backspace':
    case 'p':
    case 'P':
      return { type: 'previous' };
    case 'Home':
      return { type: 'first' };
    case 'End':
      return { type: 'last' };
    case 'b':
    case 'B':
    case '.':
      return { type: 'black' };
    case 'w':
    case 'W':
    case ',':
      return { type: 'white' };
    case 'Escape':
      return { type: 'end' };
    case 'f':
    case 'F':
      return { type: 'fullscreen' };
    default:
      return /^[0-9]$/.test(e.key) ? { type: 'digit', digit: Number(e.key) } : null;
  }
}

