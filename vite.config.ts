import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages のプロジェクトページはサブディレクトリ配信になるため、
// CI からベースパスを渡せるようにしている（ローカル開発時は '/'）。
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
})
