import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// In dev, /api is proxied to the local API (same-origin, exactly like CloudFront in production).
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': process.env.API_URL || 'http://localhost:8080' } },
  build: { sourcemap: false, assetsDir: 'assets' },
});
