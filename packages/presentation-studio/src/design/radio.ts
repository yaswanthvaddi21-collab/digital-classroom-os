import type { KeyboardEvent } from 'react';

/**
 * Arrow keys move the focus between the radios of a radio group made of buttons (WAI-ARIA radio group pattern;
 * Space or Enter then chooses, as a click).
 */
export function radioArrows(e: KeyboardEvent<HTMLElement>) {
  const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
  if (!step) return;
  const radios = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]:not(:disabled)'));
  const i = radios.indexOf(document.activeElement as HTMLElement);
  if (i < 0) return;
  e.preventDefault();
  radios[(i + step + radios.length) % radios.length].focus();
}
