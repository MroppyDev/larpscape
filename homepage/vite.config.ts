import { defineConfig } from 'vite';
import path from 'path';

// Larpscape marketing homepage — larpscape.net (the game lives at play.larpscape.net).
// Dev: npm run home:dev   Build: npm run home:build -> dist-home/
export default defineConfig({
  root: path.resolve(__dirname),
  base: '/',
  build: {
    outDir: path.resolve(__dirname, '../dist-home'),
    emptyOutDir: true,
    rollupOptions: {
      // MPA entries: / (homepage) + the auth pages. nginx serves the clean
      // URLs /login, /register, /profile via try_files $uri $uri.html.
      input: {
        index: path.resolve(__dirname, 'index.html'),
        login: path.resolve(__dirname, 'login.html'),
        register: path.resolve(__dirname, 'register.html'),
        profile: path.resolve(__dirname, 'profile.html'),
      },
    },
  },
  server: {
    port: 5176,
    // dev-only: the hiscores/stats panels hit same-origin /api (nginx proxies
    // it in prod); point dev at the local game server
    proxy: { '/api': 'http://localhost:8080' },
  },
});
