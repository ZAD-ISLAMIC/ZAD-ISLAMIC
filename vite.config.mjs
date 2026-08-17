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
  },
})