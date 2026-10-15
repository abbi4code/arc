import { defineConfig } from 'vitest/config'
import { loadEnv, type Plugin } from 'vite'
import { createHash } from 'node:crypto'
import { createReadStream, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
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
          // libraries.excalidraw.com: one-click install of shape libraries on Boards
          `connect-src 'self' ${env.VITE_SUPABASE_URL} https://libraries.excalidraw.com`,
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

/**
 * Excalidraw's fonts, served by the app itself at /excalidraw/fonts/ (BoardEditorPage sets EXCALIDRAW_ASSET_PATH),
 * so boards work offline and under `font-src 'self'`. Xiaolai (CJK, 12 MB) is left out.
 */
function excalidrawFonts(): Plugin {
  const root = fileURLToPath(new URL('./node_modules/@excalidraw/excalidraw/dist/prod/fonts', import.meta.url))
  const skip = (rel: string) => rel.startsWith('Xiaolai')
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : [join(dir, n)]))
  return {
    name: 'excalidraw-fonts',
    configureServer(server) {
      server.middlewares.use('/excalidraw/fonts/', (req, res, next) => {
        const rel = decodeURIComponent((req.url ?? '').split('?')[0]).replace(/^\/+/, '')
        const file = join(root, rel)
        if (rel.includes('..') || skip(rel) || !file.startsWith(root)) return next()
        try { statSync(file) } catch { return next() }
        res.setHeader('Content-Type', 'font/woff2')
        createReadStream(file).pipe(res)
      })
    },
    // Each font face lists Excalidraw's CDN after our copy, and Chrome requests that too (blocked by the CSP: noise
    // for every face, 230 of them). Point the fallback at our own copy as well.
    transform(code, id) {
      if (!id.includes('@excalidraw/excalidraw/dist/prod/') || !code.includes('ASSETS_FALLBACK_URL",`https://esm.sh/')) return
      const cdn = '`https://esm.sh/${M.PKG_NAME?`${M.PKG_NAME}@${M.PKG_VERSION}`:"@excalidraw/excalidraw"}/dist/prod/`'
      if (!code.includes(cdn)) this.error('Excalidraw changed its font CDN fallback; update the excalidraw-fonts plugin in vite.config.ts')
      return { code: code.replace(cdn, '`${location.origin}/excalidraw/`'), map: null }
    },
    generateBundle() {
      for (const file of walk(root)) {
        const rel = relative(root, file).split(sep).join('/')
        if (!skip(rel)) this.emitFile({ type: 'asset', fileName: `excalidraw/fonts/${rel}`, source: readFileSync(file) })
      }
    },
  }
}

/**
 * The service worker precaches what the app itself can load (entry + every lazy page/dialog in src/, with their
 * static imports). Chunks a library loads lazily on its own (Mermaid diagrams, Excalidraw's font subsetting and
 * locales) stay on-demand online, instead of ~8 MB on every phone.
 */
const onDemandChunks = new Set<string>()
// …except the small lazy pieces boards need offline: image insert (compression), open/save file, English UI.
const OFFLINE_TOO = /^assets\/(image-blob-reduce\.esm|pica|file-open|file-save|directory-open|roundRect|en-[A-Z0-9]+)-/
function trackOnDemandChunks(): Plugin {
  return {
    name: 'track-on-demand-chunks',
    apply: 'build',
    generateBundle(_, bundle) {
      const chunks = new Map(Object.values(bundle).flatMap((c) => (c.type === 'chunk' ? [[c.fileName, c] as const] : [])))
      const keep = new Set<string>()
      const visit = (file: string) => {
        if (keep.has(file)) return
        keep.add(file)
        chunks.get(file)?.imports.forEach(visit)
      }
      for (const c of chunks.values())
        if (c.isEntry || OFFLINE_TOO.test(c.fileName) || (c.isDynamicEntry && c.facadeModuleId && !c.facadeModuleId.includes('node_modules'))) visit(c.fileName)
      for (const file of chunks.keys()) if (!keep.has(file)) onDemandChunks.add(file)
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
    excalidrawFonts(),
    trackOnDemandChunks(),
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
        manifestTransforms: [async (entries) => ({ manifest: entries.filter((e) => !onDemandChunks.has(e.url)), warnings: [] })],
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
