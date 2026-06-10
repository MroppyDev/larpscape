import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Larpscape Wiki — OSRS-style game encyclopedia.
// Dev: npm run wiki:dev   Build: npm run wiki:build -> dist-wiki/
export default defineConfig({
  root: path.resolve(__dirname, 'ui'),
  plugins: [react()],
  build: {
    outDir: path.resolve(__dirname, '../dist-wiki'),
    emptyOutDir: true,
  },
  server: {
    port: 5175,
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
});
