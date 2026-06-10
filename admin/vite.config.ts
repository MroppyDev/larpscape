import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Admin SPA. Dev: `npm run admin:dev` (proxies /admin-api to the admin server
// on :8081). Build: `npm run admin:build` -> dist-admin/ (served by the admin
// server in production).
export default defineConfig({
  root: path.resolve(__dirname, 'ui'),
  plugins: [react()],
  build: {
    outDir: path.resolve(__dirname, '../dist-admin'),
    emptyOutDir: true,
  },
  server: {
    port: 5174,
    proxy: {
      '/admin-api': 'http://localhost:8081',
    },
  },
});
