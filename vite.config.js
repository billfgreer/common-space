import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/common-space/',

  build: {
    // Target modern browsers — smaller output, native ESM, no legacy polyfills
    target: 'es2022',
    chunkSizeWarningLimit: 700,

    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // MapLibre GL is ~800KB — keep in its own chunk so the landing page
          // doesn't parse it until the user actually opens an event.
          if (id.includes('node_modules/maplibre-gl')) return 'maplibre'

          // PMTiles protocol handler — only loaded with the map
          if (id.includes('node_modules/pmtiles')) return 'maplibre'

          // React, ReactDOM, router — shared base, always needed
          if (id.includes('node_modules/react') ||
              id.includes('node_modules/react-dom') ||
              id.includes('node_modules/react-router-dom')) return 'vendor'

          // Geospatial parsers — loaded lazily via dynamic import
          // (shpjs, @tmcw/togeojson, flatgeobuf) — Vite/Rollup will keep
          // them in their own auto-split chunks via the dynamic import()
        },
      },
    },
  },
})
