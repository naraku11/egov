import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'html-transforms',
      transformIndexHtml(html) {
        // Strip crossorigin attribute — avoids CORS issues behind reverse proxy
        html = html.replace(/ crossorigin/g, '');
        // Preload the CSS so it's ready before JS executes (prevents FOUC)
        html = html.replace(
          /(<link rel="stylesheet" href="(\/assets\/[^"]+\.css)">)/,
          '<link rel="preload" href="$2" as="style" />$1'
        );
        return html;
      },
    },
  ],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    modulePreload: { polyfill: false },
    // Separate heavy vendor libraries into their own chunks so they can be
    // cached independently and don't bloat the main bundle.
    rollupOptions: {
      output: {
        manualChunks: {
          // Core React runtime — cached across all page navigations
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          // Charting library (~400 KB) — only needed by admin/reports
          'vendor-charts': ['recharts'],
          // Firebase SDK (~250 KB) — only needed for phone auth on login/register
          'vendor-firebase': ['firebase/app', 'firebase/auth'],
          // OCR library (~1.4 MB) — only needed during citizen registration
          'vendor-ocr': ['tesseract.js'],
        },
      },
    },
  },
});
