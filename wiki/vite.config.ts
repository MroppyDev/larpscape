import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Larpscape Wiki — OSRS-style game encyclopedia.
// Dev: npm run wiki:dev   Build: npm run wiki:build -> dist-wiki/
const wikiBase = process.env.WIKI_BASE ? `${process.env.WIKI_BASE}/` : '/';

export default defineConfig({
  root: path.resolve(__dirname, 'ui'),
  base: wikiBase,
  plugins: [react()],
  build: {
    outDir: path.resolve(__dirname, process.env.WIKI_OUT ?? '../dist-wiki'),
    emptyOutDir: true,
  },
  server: {
    port: 5175,
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
});
