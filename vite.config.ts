import { defineConfig } from 'vitest/config'
import { loadEnv, type Plugin } from 'vite'
import { createHash } from 'node:crypto'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

/**
 * Production Content-Security-Policy as a <meta> tag: only our own scripts (plus the exact inline theme
 * script, by hash) may run, and the app may only talk to itself and Supabase. frame-ancestors can't be
 * set from <meta>, so vercel.json adds it (and X-Frame-Options) as headers.
 */
function contentSecurityPolicy(): Plugin {
  return {
    name: 'csp-meta',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const env = loadEnv(ctx.server?.config.mode ?? 'production', process.cwd(), 'VITE_')
        const hashes = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
          .map((m) => `'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`)
        const csp = [
          "default-src 'self'",
          `script-src 'self' ${hashes.join(' ')}`,
          `connect-src 'self' ${env.VITE_SUPABASE_URL}`,
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob:",
          "font-src 'self'",
          "worker-src 'self'",
          "manifest-src 'self'",
          "object-src 'none'",
          "base-uri 'none'",
          "form-action 'self'",
        ].join('; ')
        return html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`)
      },
    },
  }
}

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    rolldownOptions: {
      output: {
        // Libraries every screen needs get their own long-cached chunks, so app updates don't re-download them.
        // (No catch-all vendor group: that would pull on-demand libs like cmdk/Radix into the startup bundle.)
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom)[\\/]/ },
            { name: 'supabase', test: /node_modules[\\/]@supabase[\\/]/ },
            { name: 'query', test: /node_modules[\\/](@tanstack|idb-keyval)[\\/]/ },
          ],
        },
      },
    },
  },
  plugins: [
    contentSecurityPolicy(),
    react(),
    tailwindcss(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectRegister: false,
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        // Non-Latin font subsets still load on demand online; no need to store them on every phone.
        globIgnores: ['**/*cyrillic*', '**/*vietnamese*'],
      },
      devOptions: { enabled: true, type: 'module' },
      manifest: {
        name: 'Winter Arc',
        short_name: 'Winter Arc',
        description: 'Routines, daily plan and schedule.',
        start_url: '/',
        display: 'standalone',
        background_color: '#0b0b0f',
        theme_color: '#0b0b0f',
        icons: [
          { src: '/pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: '/maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'supabase/functions/**/*.test.ts'],
  },
})
