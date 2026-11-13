/** Strips characters that are invalid in filenames on Windows, macOS or Android. */
export function safeFileName(name: string, fallback = 'untitled') {
  const cleaned = name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
  return cleaned || fallback;
}

/**
 * Saves a blob through the browser download flow. Desktop (Tauri) and Android (Capacitor) builds
 * will swap this for a native save dialog in Phase 5.
 */
export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
