import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            // SSE 需要禁用压缩，否则流式响应会被缓冲
            proxyReq.setHeader('Accept-Encoding', 'identity')
          })
        },
      },
    },
  },
})
