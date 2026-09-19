import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
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
