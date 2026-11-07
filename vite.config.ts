import { defineConfig } from 'vitest/config';

// GitHub Pages serves the project at /universe/
export default defineConfig({
  base: process.env.BASE_PATH ?? '/universe/',
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
