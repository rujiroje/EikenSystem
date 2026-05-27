import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  cacheDir: './.vite',
  server: {
    port: 5173,
    watch: { usePolling: true },
    fs: { strict: false }
  },
  preview: {
    port: 5173
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'antd', '@ant-design/icons', 'recharts']
  }
})
