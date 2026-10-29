import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, type Plugin } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages serves the app from /<repo>/; CI sets BASE_PATH accordingly.
const base = process.env.BASE_PATH ?? '/'

/** Shown in Settings → About & support: the build's UTC date and short commit (CI sets GITHUB_SHA). */
function appBuild() {
  let sha = process.env.GITHUB_SHA?.slice(0, 7)
  if (!sha) {
    try {
      sha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
    } catch {
      // Not a git checkout.
    }
  }
  return { date: new Date().toISOString().slice(0, 10), sha: sha || 'dev' }
}

/**
 * Transformers.js asks whether optional model files exist (tokenizer.json…) and expects a 404 when
 * they don't, as GitHub Pages answers. Vite's dev and preview servers answer with the app's
 * index.html instead, so missing files under models/ and ort/ get a real 404 here.
 */
function snapFiles404(): Plugin {
  const missing = (dir: string) => (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const path = decodeURIComponent((req.url ?? '').split('?')[0]!)
    const match = path.match(/\/((?:models|ort)\/.+)$/)
    if (match && !existsSync(fileURLToPath(new URL(`${dir}/${match[1]}`, import.meta.url)))) {
      res.statusCode = 404
      res.end()
      return
    }
    next()
  }
  return {
    name: 'snap-files-404',
    configureServer: (server) => void server.middlewares.use(missing('./public')),
    configurePreviewServer: (server) => void server.middlewares.use(missing('./dist')),
  }
}

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
    // pdf.js, the full OpenCC converter and the Claude SDK are large and only needed for (online) AI import.
    // Snap's object finder (model + ONNX runtime, tens of MB) loads on first use and caches itself.
    globIgnores: ['**/pdf.worker*', '**/pdf-*.js', '**/cn2t-*.js', '**/sdk-*.js', '**/transformers.web-*.js', '**/models/**', '**/ort/**'],
    // The static About / Privacy pages (public/) are real pages, not routes of the app.
    navigateFallbackDenylist: [/\/(about|privacy)\.html$/],
  },
})

export default defineConfig({
  base,
  plugins: [react(), tailwindcss(), snapFiles404(), process.env.VITEST ? [] : pwa],
  define: { __APP_BUILD__: JSON.stringify(appBuild()) },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test-setup.ts'],
  },
})
