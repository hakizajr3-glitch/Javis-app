import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Wire the jarvis-core platform library into the desktop app.
      // The browser-safe barrel (src/browser.ts) is bundled directly.
      '@jarvis-core': fileURLToPath(new URL('../jarvis-core/src', import.meta.url)),
      // Stub out node-only modules that leak through the jarvis-core import
      // graph (capabilityRouter → policyEngine → securityLayer → crypto,
      // persistenceAdapter → better-sqlite3). These are never called in the
      // browser — the browser-safe managers use localStorage / in-memory
      // fallbacks — but Vite's dep pre-bundler tries to crawl them.
      'better-sqlite3': fileURLToPath(new URL('./src/stubs/empty.ts', import.meta.url)),
      '@mapbox/node-pre-gyp': fileURLToPath(new URL('./src/stubs/empty.ts', import.meta.url)),
      'bcrypt': fileURLToPath(new URL('./src/stubs/empty.ts', import.meta.url)),
      'crypto': fileURLToPath(new URL('./src/stubs/crypto.ts', import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: ['better-sqlite3', '@mapbox/node-pre-gyp', 'bcrypt'],
  },
  clearScreen: false,
  server: {
    port: 5176,
    strictPort: true,
    host: 'localhost',
  },
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    target: process.env.TAURI_PLATFORM === 'windows' ? 'chrome105' : 'es2022',
    minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_DEBUG,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/index.js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/index.[ext]',
      },
    },
  },
})
