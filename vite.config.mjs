import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '',
  plugins: [react()],
  optimizeDeps: {
    entries: ['index.html'],
  },
  build: {
    outDir: 'www',
    emptyOutDir: true,
    sourcemap: false,
    target: 'es2020',
    chunkSizeWarningLimit: 1024,
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      // Proxy archive.org downloads to bypass CORS during development.
      // On the real device (Cordova), cordova-plugin-advanced-http handles this natively.
      '/archive-proxy': {
        target: 'https://archive.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/archive-proxy/, ''),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('Origin', 'https://archive.org')
          })
        },
      },
      // Proxy khutabaa.com attachments to bypass CORS during development.
      '/khutabaa-proxy': {
        target: 'https://khutabaa.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/khutabaa-proxy/, ''),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('Origin', 'https://khutabaa.com')
          })
        },
      },
    },
  },
})