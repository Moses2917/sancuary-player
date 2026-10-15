import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import vueDevTools from 'vite-plugin-vue-devtools'
import { VitePWA } from 'vite-plugin-pwa'

const host = process.env.TAURI_DEV_HOST
const isTauriBuild = !!process.env.TAURI_ENV_PLATFORM

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueJsx(),
    vueDevTools(),
    !isTauriBuild &&
      VitePWA({
        registerType: 'prompt',
        includeAssets: ['favicon.ico', 'icon.svg'],
        manifest: {
          name: 'Sanctuary Player',
          short_name: 'Sanctuary',
          description: 'A dual-track instrumental player for worship services.',
          theme_color: '#ffffff',
          background_color: '#ffffff',
          display: 'standalone',
          orientation: 'any',
          scope: '/',
          start_url: '/',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
            },
            {
              src: '/maskable-icon-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          // Remote mode must never download audio through service-worker precaching.
          globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
          cleanupOutdatedCaches: true,
          clientsClaim: true,
        },
        devOptions: {
          enabled: false,
        },
      }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    proxy: {
      '/relay': { target: 'ws://127.0.0.1:8787', ws: true },
    },
    hmr: host
      ? {
          protocol: 'ws',
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
  build: {
    target: process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
    minify: !process.env.TAURI_ENV_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
})
