/**
 * Whether this browser prints the page's header, footer and page numbers (CSS page margin boxes, @top-center and
 * @bottom-center). Chromium has them from version 131; Safari and Firefox do not yet. 'unknown' when it cannot
 * tell (e.g. no user agent), so the UI can stay neutral.
 */
export function marginBoxSupport(userAgent: string = typeof navigator === 'undefined' ? '' : navigator.userAgent): 'yes' | 'no' | 'unknown' {
  if (!userAgent) return 'unknown';
  // Chrome, Edge and Firefox on iOS are WebKit underneath.
  if (/\b(CriOS|FxiOS|EdgiOS)\//.test(userAgent)) return 'no';
  const chromium = /\bChrom(?:e|ium)\/(\d+)/.exec(userAgent);
  if (chromium) return Number(chromium[1]) >= 131 ? 'yes' : 'no';
  if (/\bFirefox\/|\bVersion\/[\d.]+.*Safari\//.test(userAgent)) return 'no';
  return 'unknown';
}
