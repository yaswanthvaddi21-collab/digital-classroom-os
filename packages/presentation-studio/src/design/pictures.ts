/**
 * The pixel size of a picture file, or null when the browser cannot read it (then nothing is inserted: a picture with
 * a made-up size would be drawn distorted).
 */
export async function pictureSize(blob: Blob): Promise<{ width: number; height: number } | null> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob);
      const size = { width: bitmap.width, height: bitmap.height };
      bitmap.close?.();
      if (size.width > 0 && size.height > 0) return size;
    } catch {
      // fall through to an <img>
    }
  }
  if (typeof Image === 'undefined' || typeof URL.createObjectURL !== 'function') return null;
  const url = URL.createObjectURL(blob);
  try {
    return await new Promise((resolve) => {
      const img = new Image();
      const timer = setTimeout(() => resolve(null), 10_000);
      img.onload = () => {
        clearTimeout(timer);
        resolve(img.naturalWidth > 0 && img.naturalHeight > 0 ? { width: img.naturalWidth, height: img.naturalHeight } : null);
      };
      img.onerror = () => {
        clearTimeout(timer);
        resolve(null);
      };
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
