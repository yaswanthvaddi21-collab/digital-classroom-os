/**
 * Full screen for the slide show: the whole page (document.documentElement) goes full screen and the show, a modal
 * dialog in the top layer, covers it. (A dialog element itself cannot be made full screen.) Safari's prefixed API is
 * used where the standard one is missing. iPhone Safari has neither: the show then simply fills the window.
 */
type FsDocument = Document & { webkitFullscreenEnabled?: boolean; webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> | void };
type FsElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };

const fsDoc = () => (typeof document === 'undefined' ? null : (document as FsDocument));

/** Whether this browser can show the page full screen. */
export function fullscreenSupported(): boolean {
  const d = fsDoc();
  if (!d) return false;
  const el = d.documentElement as FsElement;
  return !!(d.fullscreenEnabled || d.webkitFullscreenEnabled) && (typeof el.requestFullscreen === 'function' || typeof el.webkitRequestFullscreen === 'function');
}

export function isFullscreen(): boolean {
  const d = fsDoc();
  return !!d && !!(d.fullscreenElement ?? d.webkitFullscreenElement);
}

/** Asks for full screen (needs a click or key press just before). Resolves whether the page is full screen. */
export async function enterFullscreen(): Promise<boolean> {
  const d = fsDoc();
  if (!d || !fullscreenSupported()) return false;
  if (isFullscreen()) return true;
  const el = d.documentElement as FsElement;
  try {
    await (el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : el.webkitRequestFullscreen?.());
  } catch {
    return false;
  }
  return isFullscreen();
}

export async function exitFullscreen(): Promise<void> {
  const d = fsDoc();
  if (!d || !isFullscreen()) return;
  try {
    await (d.exitFullscreen ? d.exitFullscreen() : d.webkitExitFullscreen?.());
  } catch {
    // Already left (the browser's own Escape).
  }
}

/** Calls `cb` whenever full screen starts or ends; returns the unsubscribe function. */
export function onFullscreenChange(cb: () => void): () => void {
  const d = fsDoc();
  if (!d) return () => undefined;
  d.addEventListener('fullscreenchange', cb);
  d.addEventListener('webkitfullscreenchange', cb);
  return () => {
    d.removeEventListener('fullscreenchange', cb);
    d.removeEventListener('webkitfullscreenchange', cb);
  };
}
