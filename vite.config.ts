import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      '/tca': {
        target: 'https://sd46rr9g19ma6giekl1c0.apigateway-cn-beijing.volceapi.com',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/tca/, ''),
      },
    }
  }
})
