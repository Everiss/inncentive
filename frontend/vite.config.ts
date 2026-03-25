import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcore from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcore()],
  server: {
    port: 3000,
  },
})
