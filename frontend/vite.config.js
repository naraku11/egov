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
  },
});
