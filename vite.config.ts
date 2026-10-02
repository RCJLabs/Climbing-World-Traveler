/// <reference types="vitest" />
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages serves the app under /<repo>/; local dev serves at /.
const base = process.env.GITHUB_PAGES === 'true' ? '/Climbing-World-Traveler/' : '/';

export default defineConfig({
  base,
  plugins: [
    preact(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Climbing World Traveler',
        short_name: 'Climbing',
        description: 'Build a climber. Live a climbing life.',
        theme_color: '#101A16',
        background_color: '#101A16',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '.',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
      workbox: { globPatterns: ['**/*.{js,css,html,svg,json}'] },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        // Generated route data changes with every generator change and is most of the app's size; its own chunk keeps
        // the code chunk under Vite's 500 kB warning and lets either be re-cached without the other.
        manualChunks: (id) => (id.includes('/data/routes/') ? 'routes' : undefined),
      },
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
