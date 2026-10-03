/// <reference types="vitest" />
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages serves the app under /<repo>/; local dev serves at /.
const base = process.env.GITHUB_PAGES === 'true' ? '/Climbing-World-Traveler/' : '/';
/** Shown on the title screen, so a player can tell which build is running. */
const build = { sha: (process.env.GITHUB_SHA ?? 'dev').slice(0, 7), date: new Date().toISOString().slice(0, 10) };

export default defineConfig({
  base,
  define: { __BUILD__: JSON.stringify(build) },
  plugins: [
    preact(),
    VitePWA({
      // A new service worker takes over as soon as it installs instead of waiting for every tab to close; main.tsx
      // registers it itself so the reload into a new version can wait for an attempt to finish (18 §6).
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Climbing World Traveler',
        short_name: 'Climbing',
        description: 'Build a climber. Live a climbing life.',
        theme_color: '#1B1B3A',
        background_color: '#1B1B3A',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '.',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
      workbox: { globPatterns: ['**/*.{js,css,html,svg,json}'], skipWaiting: true, clientsClaim: true, cleanupOutdatedCaches: true },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        // Generated route data changes with every generator change and is most of the app's size; its own chunks keep
        // the code chunk under Vite's 500 kB warning and let each be re-cached without the others. One chunk per crag:
        // Workbox precaches no file over 2 MiB, and both crags in one chunk came within 0.17 MB of it (docs/26 §8).
        manualChunks: (id) => {
          const crag = /\/data\/routes\/([a-z_]+?)_(?:benchmarks|signatures)\.json/.exec(id)?.[1];
          return crag ? `routes-${crag}` : undefined;
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
