// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // GitHub Pages serves the site under /OpenPlay/; the workflow sets VITE_BASE.
  base: process.env.VITE_BASE || '/',
  plugins: [react(), tailwindcss()],

  server: {
    // During local dev, proxy /api/* to a local Express server (see below)
    // OR you can use `vercel dev` which handles this automatically.
    proxy: {
      '/api': {
        // 127.0.0.1, not localhost: on Windows localhost can resolve to IPv6 first,
        // and the API listens on IPv4 — the proxy then answers 502.
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
    },
  },
});