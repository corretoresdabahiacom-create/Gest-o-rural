import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifestFilename: 'manifest.webmanifest',
      manifest: {
        name: 'Gestão Rural',
        short_name: 'Gestão Rural',
        description: 'Administração financeira de fazendas de gado',
        lang: 'pt-BR',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#0f1f17',
        theme_color: '#14532d',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Bibliotecas de exportação (Excel/PDF) só são baixadas quando usadas.
        globIgnores: ['**/exceljs*.js', '**/jspdf*.js', '**/html2canvas*.js', '**/purify*.js', '**/index.es-*.js'],
        runtimeCaching: [{ urlPattern: /\/assets\/.*\.js$/, handler: 'CacheFirst', options: { cacheName: 'lazy-chunks', expiration: { maxEntries: 40 } } }],
        navigateFallback: '/index.html',
        // Firestore/Auth nunca passam pelo cache: dados sempre vêm do servidor.
        navigateFallbackDenylist: [/^\/__/],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ],
  build: { chunkSizeWarningLimit: 1200 },
})
