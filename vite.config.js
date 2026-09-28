import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
// ARTIFACT=1 builds a single self-contained page (no service worker, one JS
// chunk) for previewing inside hosts that cannot run service workers.
const artifact = process.env.ARTIFACT === '1'

export default defineConfig({
  // Relative asset paths so the same build works at a domain root, a
  // sub-folder (GitHub Pages) or from a phone's local server.
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    // Installable, fully offline app: every asset is precached on first load.
    !artifact && VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['icons/icon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'GarmentOS — Pattern Studio',
        short_name: 'GarmentOS',
        description: 'Draft garment patterns in 2D and see them on a 3D body, live. Works offline.',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'any',
        background_color: '#0d1117',
        theme_color: '#161b22',
        categories: ['design', 'productivity', 'business'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        globIgnores: ['**/models/**'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  build: {
    outDir: artifact ? 'dist-artifact' : 'dist',
    chunkSizeWarningLimit: 1200,
    rolldownOptions: {
      output: {
        // three.js in its own long-lived chunk: app updates don't re-download it
        codeSplitting: artifact ? false : { groups: [{ name: 'three', test: /node_modules[\\/]three/ }] },
      },
    },
  },
  test: {
    include: ['src/**/*.test.js'],
  },
})
