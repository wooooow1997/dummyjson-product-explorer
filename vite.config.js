import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the production build also works from a sub-path
  // (GitHub Pages project sites, S3 prefixes, etc.) without reconfiguration.
  base: './',
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'es2020',
  },
  server: {
    port: 5173,
    open: false,
  },
  preview: {
    port: 4173,
  },
});
