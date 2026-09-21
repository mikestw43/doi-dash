import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Stamped into the bundle so the running app can say which build it is. The
// backend reports its own commit on /api/health, but a phone caching an old
// bundle is exactly the case where the two disagree — and the frontend is the
// half you are looking at.
const buildId = (() => {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'dev';
  }
})();

export default defineConfig({
  plugins: [react()],
  define: { __BUILD_ID__: JSON.stringify(buildId) },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      // Live account updates. Without this the dev server has nothing on /ws
      // and the dashboard sits at "offline" while the numbers never move.
      '/ws': {
        target: 'ws://localhost:4000',
        ws: true,
      },
    },
  },
});
