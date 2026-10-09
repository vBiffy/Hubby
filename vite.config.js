import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// The browser calls the same origin in development and production.
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://127.0.0.1:3001' } },
});
