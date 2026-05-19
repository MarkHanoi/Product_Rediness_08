import { defineConfig } from 'vite';

// PRYZM Family Marketplace browse SPA — runs on a separate port from the
// main Pryzm app.  In the local dev loop the API proxy points at the same
// `server.js` that hosts `/api/v1/families` (S59 deliverable).  In
// production this build is served as static assets behind the same
// Express app via `app.use(express.static(...))` from `server.js`.

export default defineConfig({
  root: '.',
  base: '/marketplace/',
  server: {
    host: true,
    port: 5174,
    strictPort: false,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: 'index.html',
    },
  },
});
