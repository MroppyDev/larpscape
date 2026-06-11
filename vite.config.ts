import { defineConfig } from 'vite';
import { execSync } from 'node:child_process';

// Build id baked into the bundle; the server reports its own at /api/version
// and in the ws hello so stale clients know to refresh after a deploy.
function buildId(): string {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return 'dev';
  }
}

export default defineConfig(({ command }) => ({
  define: {
    // Dev serves straight from source — no stale-cache problem, so opt out of
    // the auto-refresh handshake ('dev' is never treated as a mismatch).
    __BUILD_ID__: JSON.stringify(command === 'serve' ? 'dev' : buildId()),
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8080',
      '/ws': { target: 'ws://localhost:8080', ws: true },
    },
  },
}));
