import { defineConfig } from 'vite';
import path from 'path';

// Larpscape Trade — trade.larpscape.net (the Aldgate board, on the web).
// Dev: npm run trade:dev   Build: npm run trade:build -> dist-trade/
export default defineConfig({
  root: path.resolve(__dirname),
  base: '/',
  build: {
    outDir: path.resolve(__dirname, '../dist-trade'),
    emptyOutDir: true,
  },
  server: {
    port: 5177,
    // dev-only: prod nginx proxies same-origin /api to the game server
    proxy: { '/api': 'http://localhost:8080' },
  },
});
