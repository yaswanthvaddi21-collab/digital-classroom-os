const MAX_DIMENSION = 1600;
const MAX_INPUT_BYTES = 15 * 1024 * 1024;
/** Width an image is inserted at by default, in CSS pixels. Users can resize afterwards. */
const DEFAULT_DISPLAY_WIDTH = 520;

function load(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('This file is not a readable image'));
    img.src = src;
  });
}

const readAsDataUrl = (file: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });

/**
 * Reads an image as an embeddable data URL, downscaling very large photos so documents stay small enough
 * to save quickly and export to DOCX. Formats other than PNG, JPEG and GIF are converted to PNG for Word.
 */
export async function readImageFile(file: File): Promise<{ src: string; width: number; height: number }> {
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file');
  if (file.size > MAX_INPUT_BYTES) throw new Error('Image is larger than 15 MB');
  const original = await readAsDataUrl(file);
  const img = await load(original);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(img.naturalWidth, img.naturalHeight));
  let src = original;
  // Word shows PNG, JPEG and GIF; anything else (WebP, SVG, BMP…) is stored as PNG.
  if (scale < 1 || !/^image\/(png|jpeg|gif)$/.test(file.type)) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    src = file.type === 'image/jpeg' ? canvas.toDataURL('image/jpeg', 0.86) : canvas.toDataURL('image/png');
  }
  const width = Math.min(DEFAULT_DISPLAY_WIDTH, img.naturalWidth);
  return { src, width, height: Math.round((img.naturalHeight / img.naturalWidth) * width) };
}

const FETCH_TIMEOUT_MS = 15_000;

/**
 * Fetches a picture from another website and returns it as a data URL to store in the document, or null when the
 * website does not allow it (most do not let other sites read their images), the connection fails, or it is not an
 * image. No cookies or referrer are sent.
 */
export async function inlineRemoteImage(src: string, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const url = src.startsWith('//') ? `https:${src}` : src;
    const res = await fetchImpl(url, { mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer', signal: controller.signal });
    if (!res.ok) return null;
    const blob = await res.blob();
    const type = blob.type || res.headers.get('content-type') || '';
    if (!type.startsWith('image/')) return null;
    const name = decodeURIComponent(new URL(url).pathname.split('/').pop() || 'image');
    return (await readImageFile(new File([blob], name, { type }))).src;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
