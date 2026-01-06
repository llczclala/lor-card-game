import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // 关键配置：这里填写你的 GitHub 仓库名
  // 例如，如果你的仓库叫 'lor-card-game'，这里就填 '/lor-card-game/'
  // 如果你还没想好名字，或者想通用一点，可以使用 './' (相对路径)，但这在某些路由情况下可能会有问题
  // 强烈建议使用 '/<仓库名>/'
  base: './',
})