import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const API_TARGET = process.env.VITE_API_PROXY ?? 'http://127.0.0.1:8787'

// GitHub 토큰 교환·게임 API는 Express 서버(server/index.ts)에서 처리합니다.
// 개발: 터미널에서 `npm run server` 또는 `npm run dev:full` 로 API 서버를 띄운 뒤 `npm run dev`.
export default defineConfig(({ mode }) => {
  loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': {
          target: API_TARGET,
          changeOrigin: true,
        },
      },
    },
  }
})
