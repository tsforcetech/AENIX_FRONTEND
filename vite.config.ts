/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// The SPA is served same-origin with Aenix.Api (ADR-007 §4). In local dev the
// API is proxied under /api so cookies stay first-party.
const PROTOTYPE_MODES = new Set(['development', 'prototype', 'artifact', 'test']);

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      // Production builds get an empty seed: sample data can never ship (see src/prototype/seed.empty.ts).
      ...(PROTOTYPE_MODES.has(mode)
        ? []
        : [
            {
              find: /^@\/prototype\/seed$/,
              replacement: fileURLToPath(new URL('./src/prototype/seed.empty.ts', import.meta.url)),
            },
          ]),
      { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
    ],
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.AENIX_API_URL ?? 'https://localhost:7001',
        changeOrigin: false,
        secure: false,
      },
    },
  },
  build: {
    sourcemap: true,
    target: 'es2022',
    outDir: mode === 'prototype' ? 'dist-prototype' : mode === 'artifact' ? 'dist-artifact' : 'dist',
    // Single-file shareable preview (scripts/inline-artifact.mjs): inline fonts/images, one CSS file.
    ...(mode === 'artifact' ? { assetsInlineLimit: 50_000_000, cssCodeSplit: false, sourcemap: false } : {}),
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
}));
