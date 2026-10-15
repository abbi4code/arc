// Excalidraw builds its font URLs when its module first evaluates, so this runs at app startup (main.tsx),
// before any Excalidraw chunk can load. Fonts are served by the app itself
// (vite.config.ts copies them), never from Excalidraw's CDN — boards work offline and under `font-src 'self'`.
declare global { interface Window { EXCALIDRAW_ASSET_PATH?: string | string[] } }

window.EXCALIDRAW_ASSET_PATH = '/excalidraw/'

export {}
