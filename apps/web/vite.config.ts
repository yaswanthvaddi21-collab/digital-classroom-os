import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const rootPackage = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { version: string };
const unavailable = fileURLToPath(new URL('./src/lib/unavailable.ts', import.meta.url));

export default defineConfig({
  // Relative base so the same build loads from Tauri, Capacitor and any static host.
  base: './',
  define: { __APP_VERSION__: JSON.stringify(rootPackage.version) },
  resolve: {
    // jsPDF's optional HTML renderers are never used (see src/lib/unavailable.ts).
    alias: { html2canvas: unavailable, canvg: unavailable, dompurify: unavailable },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // Never reload a tab on our own: the app shows "Update now" and saves pending edits first.
      registerType: 'prompt',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Digital Classroom OS',
        short_name: 'Classroom OS',
        description: 'Offline-first documents, diagrams, presentations and classroom tools.',
        theme_color: '#4f46e5',
        background_color: '#f7f7f8',
        display: 'standalone',
        start_url: '.',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
      workbox: {
        // Phase 7 EXPORT: PptxGenJS is its own lazily loaded chunk (pptxgen.es-*.js, about 273 kB, 95 kB gzip), precached
        // like the other chunks for offline export; well under the per-file limit below (checked with a build, 2026-11-14).
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: 'index.html',
      },
    }),
  ],
  server: { port: 5173 },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900,
  },
});
