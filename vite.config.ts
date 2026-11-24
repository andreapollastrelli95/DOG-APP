import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { localAi } from './server/local-ai'

export default defineConfig({
  plugins: [react(), tailwindcss(), localAi(process.env)],
  server: { port: 5173 },
  build: { chunkSizeWarningLimit: 900 },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
} as any)
