// vite.config.js — same @vitejs/plugin-react shape as jarvis-tauri/vite.config.ts.
// vite ^5.4.0 + @vitejs/plugin-react ^4.2.0 on both.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    host: 'localhost',
    port: 5177,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // The renderer never imports Node builtins directly; we proxy all secrets
    // through the preload bridge, so we mark them external here defensively.
    rollupOptions: { external: ['electron'] },
  },
});
