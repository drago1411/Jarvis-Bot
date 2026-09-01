import { defineConfig } from 'vite';

export default defineConfig({
  // Root is the workbench folder
  root: '.',
  // Dev server config
  server: {
    port: 5173,
    open: true,        // auto-opens browser on npm run dev
    host: 'localhost',
  },
  // Build output
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  // Preview server (after build)
  preview: {
    port: 4173,
    open: true,
  },
});
