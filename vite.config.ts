import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// Served from https://nsheaps.github.io/ring-creator/ (match the repo name).
export default defineConfig({
  base: process.env.RING_BASE ?? '/ring-creator/',
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: { chunkSizeWarningLimit: 1500 },
});
