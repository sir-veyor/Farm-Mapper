/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './', // relative paths: works under github.io/<repo>/ whatever the repo capitalisation
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['sql-wasm-browser.wasm', 'icons/*.png'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,wasm,pbf,png,svg}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: 'index.html',
      },
      manifest: {
        name: 'Farm Mapper',
        short_name: 'FarmMapper',
        description: 'Offline parcel POI and map layer app',
        display: 'standalone',
        orientation: 'any',
        background_color: '#e9e6df',
        theme_color: '#2f5d3a',
        start_url: '.',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
    }),
  ],
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
