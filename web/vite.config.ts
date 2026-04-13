import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return undefined
          }

          if (id.includes('react-router-dom')) {
            return 'router'
          }

          if (
            id.includes('/react/') ||
            id.includes('\\react\\') ||
            id.includes('/react-dom/') ||
            id.includes('\\react-dom\\')
          ) {
            return 'react-vendor'
          }

          if (id.includes('lucide-react')) {
            return 'icons'
          }

          if (id.includes('date-fns')) {
            return 'date-utils'
          }

          if (id.includes('idb')) {
            return 'storage'
          }

          return 'vendor'
        },
      },
    },
  },
})
