import { defineConfig } from 'vitest/config';

export default defineConfig({ test: { include: ['tests/fixtures/v0.1.0/generate.gen.ts'], environment: 'node', root: '.' } });
