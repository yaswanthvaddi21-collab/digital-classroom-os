/**
 * Pictures the DOCX export needs for G-INSERT content, drawn in the browser before the (synchronous) conversion:
 * shapes (from their SVG) and equations Word cannot take natively (from KaTeX's rendering). They go into the
 * export's assets under the keys docx/insert.ts looks up. Anything that cannot be drawn here (no canvas, a browser
 * that refuses to export the drawing) is simply missing, and the converter writes a reported fallback instead.
 */
import type { JSONContent } from '@tiptap/core';
import katex from 'katex';
import katexCss from 'katex/dist/katex.min.css?inline';
import { KATEX_OPTIONS } from '../extensions/equation';
import { readShape, shapeSvg, svgDataUrl } from '../extensions/shapeModel';
import type { DocumentContent } from '../types';
import { equationAssetKey, PICTURE_SCALE, shapeAssetKey, wordEquation } from './docx/insert';

/** Draws an SVG document to PNG bytes at `scale` device pixels per CSS pixel, or null when the browser cannot. */
export type Rasterizer = (svg: string, width: number, height: number) => Promise<Uint8Array | null>;

const TIMEOUT_MS = 8000;

function withTimeout<T>(p: Promise<T>, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), TIMEOUT_MS);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

/** The browser rasterizer: the SVG as an image, drawn on a canvas, read back as PNG. */
export const browserRasterizer: Rasterizer = (svg, width, height) =>
  withTimeout(
    (async () => {
      if (typeof document === 'undefined' || typeof Image === 'undefined') return null;
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('The picture could not be drawn.'));
        img.src = svgDataUrl(svg);
      });
      await img.decode?.().catch(() => undefined);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.ceil(width * PICTURE_SCALE));
      canvas.height = Math.max(1, Math.ceil(height * PICTURE_SCALE));
      const g = canvas.getContext('2d');
      if (!g) return null;
      g.scale(PICTURE_SCALE, PICTURE_SCALE);
      g.drawImage(img, 0, 0, width, height);
      // A browser that treats the drawing as unreadable (some refuse SVG with HTML inside) throws here.
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
    })(),
    null,
  );

let embeddedCss: Promise<string> | null = null;

/** KaTeX's stylesheet with its fonts inlined (WOFF2 only): a picture drawn from SVG can load nothing from outside. */
function katexCssWithFonts(): Promise<string> {
  embeddedCss ??= (async () => {
    const faces = /src:\s*url\(\s*["']?([^)"']+?\.woff2)["']?\s*\)\s*format\(\s*["']?woff2["']?\s*\)[^;}]*/g;
    const urls = [...new Set([...katexCss.matchAll(faces)].map((m) => m[1]))];
    const data = new Map<string, string>();
    await Promise.all(
      urls.map(async (url) => {
        try {
          const res = await fetch(new URL(url, document.baseURI).href);
          if (!res.ok) return;
          const bytes = new Uint8Array(await res.arrayBuffer());
          let bin = '';
          for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
          data.set(url, `data:font/woff2;base64,${btoa(bin)}`);
        } catch {
          // Without the font the browser falls back to another; the picture is still drawn.
        }
      }),
    );
    return katexCss.replace(faces, (whole, url: string) => (data.has(url) ? `src:url(${data.get(url)}) format("woff2")` : whole));
  })();
  return embeddedCss;
}

/** Draws an equation as KaTeX does in the editor, to PNG bytes; null when it is invalid or cannot be drawn here. */
export async function equationPicture(latex: string, display: boolean, rasterize: Rasterizer = browserRasterizer): Promise<Uint8Array | null> {
  if (typeof document === 'undefined') return null;
  let html: string;
  try {
    html = katex.renderToString(latex, { ...KATEX_OPTIONS, displayMode: display, output: 'html' });
  } catch {
    return null;
  }
  const css = await katexCssWithFonts();
  const box = document.createElement('div');
  box.className = 'dcos-equation-picture';
  box.style.cssText = 'position:fixed;left:-10000px;top:0;display:inline-block;padding:2px 4px;font:12pt/1.5 Carlito, Calibri, Arial, sans-serif;color:#1a1a1f;background:#fff;white-space:nowrap';
  box.innerHTML = `<style>${css} .dcos-equation-picture .katex { font-size: 1.1em; } .dcos-equation-picture .katex-display { margin: 0; }</style>${html}`;
  document.body.appendChild(box);
  try {
    await document.fonts?.ready;
    const rect = box.getBoundingClientRect();
    const width = Math.ceil(rect.width);
    const height = Math.ceil(rect.height);
    if (!width || !height) return null;
    box.style.position = 'static';
    box.style.left = '';
    const xhtml = new XMLSerializer().serializeToString(box);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><foreignObject x="0" y="0" width="${width}" height="${height}">${xhtml}</foreignObject></svg>`;
    return await rasterize(svg, width, height);
  } finally {
    box.remove();
  }
}

/** The shapes and the equations Word cannot take natively, once each. */
export function picturesNeeded(doc: JSONContent) {
  const shapes = new Map<string, Record<string, unknown>>();
  const equations = new Map<string, { latex: string; display: boolean }>();
  const walk = (n: JSONContent) => {
    if (n.type === 'shape') shapes.set(shapeAssetKey(n.attrs), n.attrs ?? {});
    if (n.type === 'inlineMath' || n.type === 'blockMath') {
      const latex = String(n.attrs?.latex ?? '').trim();
      const display = n.type === 'blockMath';
      if (latex && !wordEquation(latex)) equations.set(equationAssetKey(latex, display), { latex, display });
    }
    n.content?.forEach(walk);
  };
  walk(doc);
  return { shapes, equations };
}

/** Draws every picture the export needs into `assets`. Registered in DOCX_PREPARERS (docx/index.ts). */
export async function prepareInsertPictures(content: DocumentContent, assets: Map<string, Uint8Array>, rasterize: Rasterizer = browserRasterizer) {
  const { shapes, equations } = picturesNeeded(content.doc);
  for (const [key, attrs] of shapes) {
    if (assets.has(key)) continue;
    const s = readShape(attrs);
    const png = await rasterize(shapeSvg(attrs), s.width, s.height);
    if (png) assets.set(key, png);
  }
  for (const [key, { latex, display }] of equations) {
    if (assets.has(key)) continue;
    const png = await equationPicture(latex, display, rasterize);
    if (png) assets.set(key, png);
  }
}
