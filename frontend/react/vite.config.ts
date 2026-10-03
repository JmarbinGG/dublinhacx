import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The app is written against the React API but ships Preact (via
// preact/compat), which is ~70 KB smaller gzipped - a big deal on a capped
// rural connection. React stays installed only for its TypeScript types.
// (react-router's optional useOptimistic falls back cleanly under Preact.)
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^react-dom\/client$/, replacement: 'preact/compat/client' },
      { find: /^react-dom$/, replacement: 'preact/compat' },
      { find: /^react\/jsx-runtime$/, replacement: 'preact/jsx-runtime' },
      { find: /^react\/jsx-dev-runtime$/, replacement: 'preact/jsx-dev-runtime' },
      { find: /^react$/, replacement: 'preact/compat' },
    ],
  },
  build: {
    // Keep the budget honest: report gzip sizes and fail loudly on bloat.
    reportCompressedSize: true,
    chunkSizeWarningLimit: 120,
  },
  server: {
    host: true,
    allowedHosts: true,
  },
})
