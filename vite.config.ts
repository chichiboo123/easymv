import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// 커스텀 도메인(easymv.chichiboo.link) 루트에 배포하므로 base는 '/'.
// 기본 GitHub Pages 주소(chichiboo123.github.io/easymv/)로 바꾸려면 base를 '/easymv/'로 변경하세요.
export default defineConfig({
  base: '/',
  plugins: [react()],
})
