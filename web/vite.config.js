import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Vanilla multi-page build: index.html (the wall) + about.html (methodology).
// root defaults to this file's directory (web/); public/ -> grid_data.json is
// served at BASE_URL and copied into dist verbatim.
export default defineConfig({
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        about: resolve(import.meta.dirname, 'about.html'),
      },
    },
  },
});
