import { defineConfig } from 'vitest/config';

// GitHub Pages serves the project at /universe/
export default defineConfig({
  base: process.env.BASE_PATH ?? '/universe/',
  // Fixed port, reachable from outside the container: it is port-forwarded, so fail
  // instead of silently picking another, and accept whatever Host the forward uses.
  server: { host: '0.0.0.0', port: 5173, strictPort: true, allowedHosts: true },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
