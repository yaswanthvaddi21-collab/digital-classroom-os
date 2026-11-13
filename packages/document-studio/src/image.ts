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
 * to save quickly and export to DOCX. WebP is converted to PNG/JPEG because Word cannot display it.
 */
export async function readImageFile(file: File): Promise<{ src: string; width: number; height: number }> {
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file');
  if (file.size > MAX_INPUT_BYTES) throw new Error('Image is larger than 15 MB');
  const original = await readAsDataUrl(file);
  const img = await load(original);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(img.naturalWidth, img.naturalHeight));
  let src = original;
  if (scale < 1 || file.type === 'image/webp') {
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    src = file.type === 'image/jpeg' ? canvas.toDataURL('image/jpeg', 0.86) : canvas.toDataURL('image/png');
  }
  const width = Math.min(DEFAULT_DISPLAY_WIDTH, img.naturalWidth);
  return { src, width, height: Math.round((img.naturalHeight / img.naturalWidth) * width) };
}
