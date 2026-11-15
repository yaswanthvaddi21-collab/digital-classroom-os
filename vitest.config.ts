import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // vite-plugin-pwa's virtual module exists only in the app build; unit tests get a stand-in (tests/stubs).
    alias: { 'virtual:pwa-register/react': fileURLToPath(new URL('./tests/stubs/pwa-register-react.ts', import.meta.url)) },
  },
  test: {
    include: ['apps/*/src/**/*.test.{ts,tsx}', 'packages/*/src/**/*.test.{ts,tsx}', 'tests/**/*.test.{ts,tsx}'],
    exclude: ['**/node_modules/**', 'e2e/**', 'tests/fixtures/**/*.gen.ts'],
    // Node by default; DOM tests opt in with a `// @vitest-environment jsdom` comment.
    environment: 'node',
    setupFiles: ['tests/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['apps/web/src/**', 'packages/*/src/**'],
      exclude: ['**/*.test.*'],
      reporter: ['text-summary', 'html', 'lcov'],
      // Per-file floors for the code that guards user data. Raise, never lower.
      thresholds: {
        'packages/local-storage/src/**': { lines: 85 },
        'packages/document-studio/src/migrate.ts': { lines: 90 },
        'packages/diagram-studio/src/types.ts': { lines: 85 },
        // Phase 7 (ADR 0014): the presentation schema rule and protected view.
        'packages/presentation-studio/src/migrate.ts': { lines: 90 },
        'packages/presentation-studio/src/compat.ts': { lines: 90 },
        'packages/presentation-studio/src/safety.ts': { lines: 90 },
      },
    },
  },
});
