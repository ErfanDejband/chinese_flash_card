import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages serves the app from /<repo>/; CI sets BASE_PATH accordingly.
const base = process.env.BASE_PATH ?? '/'

const pwa = VitePWA({
  registerType: 'prompt', // never reload mid-review; the app shows an "update available" toast
  pwaAssets: { image: 'public/favicon.svg', preset: 'minimal-2023' },
  manifest: {
    name: 'Mandarin Leitner',
    short_name: 'Leitner',
    description: 'Learn Mandarin vocabulary with the Leitner box system',
    lang: 'en',
    display: 'standalone',
    start_url: base,
    scope: base,
    theme_color: '#c2410c',
    background_color: '#f7f4ef',
  },
  workbox: {
    globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
    // pdf.js and the full OpenCC converter are large and only needed for (online) AI import.
    globIgnores: ['**/pdf.worker*', '**/pdf-*.js', '**/cn2t-*.js'],
  },
})

export default defineConfig({
  base,
  plugins: [react(), tailwindcss(), process.env.VITEST ? [] : pwa],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test-setup.ts'],
  },
})
