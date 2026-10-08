import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiPort = process.env.API_PORT || 4000;

// The client calls /api/...; Vite forwards those requests to the Express server.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': `http://localhost:${apiPort}` },
  },
});
