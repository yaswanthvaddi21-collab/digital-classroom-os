import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // Relative base so the same build loads from Tauri, Capacitor and any static host.
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Digital Classroom OS',
        short_name: 'Classroom OS',
        description: 'Offline-first documents, diagrams and classroom tools.',
        theme_color: '#4f46e5',
        background_color: '#f7f7f8',
        display: 'standalone',
        start_url: '.',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: 'index.html',
      },
    }),
  ],
  server: { port: 5173 },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
});
